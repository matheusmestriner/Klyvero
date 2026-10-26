import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TooManyRequestsException } from '../../common/too-many-requests.exception';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthDefenseService } from '../../infra/security/auth-defense.service';
import { constantTimeSecretEquals } from '../../common/constant-time';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { MailerService } from '../../infra/mail/mailer.service';
import { BootstrapDto, ForgotPasswordDto, LoginDto, OwnerRecoveryDto, ResetPasswordDto } from './dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly dummyHash = argon2.hash('klyvero-invalid-account-timing-equalizer');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly defense: AuthDefenseService,
    private readonly mailer: MailerService,
  ) {}

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async access(user: { id: string; tenantId: string; role: string; email: string }) {
    return this.jwt.signAsync(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
        tokenType: 'access',
      },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
        algorithm: 'HS256',
        issuer: this.config.get('JWT_ISSUER') ?? 'klyvero-api',
        audience: this.config.get('JWT_AUDIENCE') ?? 'klyvero-web',
      } as any,
    );
  }

  async bootstrap(dto: BootstrapDto) {
    if (this.config.get('BOOTSTRAP_ENABLED') === 'false') {
      throw new UnauthorizedException('Bootstrap is disabled');
    }
    if (!constantTimeSecretEquals(dto.bootstrapToken, this.config.get('BOOTSTRAP_TOKEN'))) {
      throw new UnauthorizedException();
    }

    const passwordHash = await argon2.hash(dto.password);
    return this.prisma.$transaction(async (tx) => {
      // Constant SQL statement. Tagged raw execution keeps the codebase free of
      // unsafe raw-query APIs and prevents future interpolation regressions.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9021001)`;
      if (await tx.user.count()) throw new BadRequestException('Platform already initialized');

      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName.trim(),
          slug: dto.tenantSlug.trim().toLowerCase(),
          type: 'PLATFORM',
          branding: { create: { productName: 'Klyvero', companyName: dto.tenantName.trim() } },
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          role: 'OWNER',
        },
      });
      await tx.pipeline.create({
        data: {
          tenantId: tenant.id,
          name: 'Pipeline principal',
          isDefault: true,
          stages: {
            create: [
              { name: 'Novo', position: 1, probability: 10 },
              { name: 'Contato', position: 2, probability: 25 },
              { name: 'Qualificado', position: 3, probability: 50 },
              { name: 'Proposta', position: 4, probability: 75 },
              { name: 'Ganho', position: 5, probability: 100 },
            ],
          },
        },
      });
      return {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        user: { id: user.id, email: user.email },
      };
    });
  }

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }) {
    const tenantSlug = dto.tenantSlug.trim().toLowerCase();
    const email = dto.email.trim().toLowerCase();
    await this.defense.assertAllowed(tenantSlug, email, meta.ip);

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    const user = tenant?.status === 'ACTIVE'
      ? await this.prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } })
      : null;

    // Always execute one Argon2 verification. This reduces tenant/user enumeration
    // through response timing when a workspace or account does not exist.
    const passwordHash = user?.passwordHash ?? await this.dummyHash;
    let passwordValid = false;
    try {
      passwordValid = await argon2.verify(passwordHash, dto.password);
    } catch {
      passwordValid = false;
    }

    if (!tenant || tenant.status !== 'ACTIVE' || !user?.active || !passwordValid) {
      await this.defense.recordFailure(tenantSlug, email, meta.ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.defense.recordSuccess(tenantSlug, email, meta.ip);

    const refresh = randomBytes(48).toString('base64url');
    const familyId = randomUUID();
    const days = Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 30);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshSession.updateMany({
        where: { userId: user.id, OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] },
        data: { revocationReason: 'expired-or-previously-revoked' },
      });
      const active = await tx.refreshSession.findMany({
        where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        skip: 19,
      });
      if (active.length) {
        await tx.refreshSession.updateMany({
          where: { id: { in: active.map((row) => row.id) } },
          data: { revokedAt: now, revocationReason: 'session-cap' },
        });
      }
      await tx.refreshSession.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: this.hashToken(refresh),
          expiresAt: new Date(Date.now() + days * 86_400_000),
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    });

    return {
      accessToken: await this.access(user),
      refreshToken: refresh,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

  async refresh(raw: string | undefined, meta: { ip?: string; userAgent?: string } = {}) {
    if (!raw) throw new UnauthorizedException();
    const tokenHash = this.hashToken(raw);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: { include: { tenant: { select: { status: true } } } } },
    });

    if (!session) throw new UnauthorizedException();

    if (session.revokedAt) {
      await this.prisma.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: 'refresh-token-replay' },
      });
      throw new UnauthorizedException('Refresh session is no longer valid');
    }

    if (
      session.expiresAt < new Date() ||
      !session.user.active ||
      session.user.tenant.status !== 'ACTIVE'
    ) {
      await this.prisma.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: 'expired-or-disabled' },
      });
      throw new UnauthorizedException();
    }

    const next = randomBytes(48).toString('base64url');
    const nextHash = this.hashToken(next);
    const days = Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 30);
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.refreshSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: {
            revokedAt: now,
            replacedByTokenHash: nextHash,
            revocationReason: 'rotated',
          },
        });
        if (claimed.count !== 1) throw new TooManyRequestsException('Concurrent refresh rejected');

        await tx.refreshSession.create({
          data: {
            userId: session.user.id,
            familyId: session.familyId,
            parentTokenHash: tokenHash,
            tokenHash: nextHash,
            expiresAt: new Date(Date.now() + days * 86_400_000),
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
      });
    } catch (error) {
      if (error instanceof TooManyRequestsException) {
        await this.prisma.refreshSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date(), revocationReason: 'concurrent-refresh-replay' },
        });
        throw new UnauthorizedException('Refresh session replay detected');
      }
      throw error;
    }

    return {
      accessToken: await this.access(session.user),
      refreshToken: next,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        tenantId: session.user.tenantId,
      },
    };
  }

  /**
   * Public hint used by /login and /setup to decide whether the first-run
   * screen should be offered. It never exposes the bootstrap token.
   */
  async bootstrapStatus() {
    const enabled = this.config.get('BOOTSTRAP_ENABLED') !== 'false' && !!this.config.get<string>('BOOTSTRAP_TOKEN');
    const initialized = (await this.prisma.user.count()) > 0;
    return { initialized, available: enabled && !initialized };
  }

  private webOrigin() {
    const first = String(this.config.get('WEB_ORIGIN') ?? 'http://localhost:3000').split(',')[0].trim();
    try { return new URL(first).origin; } catch { return 'http://localhost:3000'; }
  }

  /**
   * Always answers the same way, whether or not the account exists, so the
   * endpoint cannot be used to enumerate workspaces or e-mail addresses.
   */
  async forgotPassword(dto: ForgotPasswordDto, meta: { ip?: string }) {
    const generic = { ok: true };
    const tenantSlug = dto.tenantSlug.trim().toLowerCase();
    const email = dto.email.trim().toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    const user = tenant?.status === 'ACTIVE'
      ? await this.prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } })
      : null;
    if (!tenant || !user?.active) return generic;

    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } },
      select: { id: true },
    });
    if (recent) return generic;

    const raw = randomBytes(32).toString('base64url');
    const ttlMinutes = Number(this.config.get('PASSWORD_RESET_TTL_MINUTES') ?? 30);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(raw),
          expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
          ip: meta.ip,
        },
      }),
    ]);

    const product = this.config.get<string>('PLATFORM_DEFAULT_NAME') ?? 'Klyvero';
    const link = `${this.webOrigin()}/reset-password?token=${raw}`;
    // Not awaited: the response time must not reveal whether the account exists.
    void this.mailer
      .send({
        to: user.email,
        subject: `Redefinição de senha - ${product}`,
        text: `Olá, ${user.name}.\n\nRecebemos um pedido para redefinir a senha da sua conta no ${product} (workspace ${tenant.slug}).\n\nPara criar uma nova senha, acesse o link abaixo. Ele vale por ${ttlMinutes} minutos e só pode ser usado uma vez:\n${link}\n\nSe você não fez esse pedido, ignore esta mensagem: sua senha continua a mesma.`,
      })
      .catch((error) => this.logger.warn(`Password reset mail not delivered: ${error instanceof Error ? error.message : String(error)}`));

    return generic;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const invalid = () => new BadRequestException('Invalid or expired reset token');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(dto.token) },
      include: { user: { include: { tenant: { select: { status: true } } } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.active || record.user.tenant.status !== 'ACTIVE') {
      throw invalid();
    }

    const passwordHash = await argon2.hash(dto.password);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Single-use: only one concurrent request can claim the token.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw invalid();
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.refreshSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'password-reset' },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
    });
    return { ok: true };
  }

  /**
   * Break-glass reset of a workspace OWNER password, authorised by the
   * platform operator's OWNER_RECOVERY_CODE. Disabled while the variable is unset.
   */
  async ownerRecovery(dto: OwnerRecoveryDto, meta: { ip?: string }) {
    const tenantSlug = dto.tenantSlug.trim().toLowerCase();
    const email = dto.email.trim().toLowerCase();
    await this.defense.assertAllowed(tenantSlug, email, meta.ip);

    const codeValid = constantTimeSecretEquals(dto.recoveryCode, this.config.get<string>('OWNER_RECOVERY_CODE'));
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    const user = tenant?.status === 'ACTIVE'
      ? await this.prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } })
      : null;

    if (!codeValid || !tenant || !user?.active || user.role !== 'OWNER') {
      await this.defense.recordFailure(tenantSlug, email, meta.ip);
      throw new UnauthorizedException('Invalid recovery request');
    }
    await this.defense.recordSuccess(tenantSlug, email, meta.ip);

    const passwordHash = await argon2.hash(dto.password);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'owner-recovery' },
      }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.auditLog.create({
        data: { tenantId: tenant.id, action: 'auth.owner-recovery', entity: 'user', entityId: user.id, ip: meta.ip },
      }),
    ]);
    return { ok: true };
  }

  async logout(raw: string | undefined) {
    if (raw) {
      await this.prisma.refreshSession.updateMany({
        where: { tokenHash: this.hashToken(raw), revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: 'logout' },
      });
    }
    return { ok: true };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'logout-all' },
    });
    return { ok: true };
  }

  async me(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        tenant: { select: { name: true, slug: true, type: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
