import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { AuthUser } from '../../common/auth.types';
import { isValidBrDocument, onlyDigits } from '../../common/br-document';
import { DEFAULT_PIPELINE } from '../../common/default-pipeline';
import { MailerService } from '../../infra/mail/mailer.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateInviteDto, SignupDto } from './dto';

const INVALID_INVITE = 'Convite inválido, expirado ou já utilizado';

/** Words that would collide with web routes or read as the platform itself. */
const RESERVED_SLUGS = new Set(['admin', 'api', 'app', 'www', 'login', 'setup', 'cadastro', 'platform', 'plataforma', 'klyvero', 'suporte', 'support', 'root', 'owner']);

export type InviteStatus = 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private webOrigin() {
    const first = String(this.config.get('WEB_ORIGIN') ?? 'http://localhost:3000').split(',')[0].trim();
    try { return new URL(first).origin; } catch { return 'http://localhost:3000'; }
  }

  private status(invite: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InviteStatus {
    if (invite.usedAt) return 'USED';
    if (invite.revokedAt) return 'REVOKED';
    return invite.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'PENDING';
  }

  /** Only the platform owner side issues white-label invites. */
  private async issuer(user: AuthUser) {
    if (user.authType === 'API_KEY') throw new ForbiddenException('Convites são emitidos por um usuário, não por uma chave de API');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { id: true, type: true } });
    if (tenant?.type !== 'PLATFORM') throw new ForbiddenException('Somente o workspace da plataforma emite convites de cadastro');
    return tenant;
  }

  async createInvite(user: AuthUser, dto: CreateInviteDto) {
    const tenant = await this.issuer(user);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + (dto.validityDays ?? 7) * 86_400_000);
    const invite = await this.prisma.signupInvite.create({
      data: {
        tenantId: tenant.id,
        createdByUserId: user.sub,
        label: dto.label.trim(),
        email: dto.email?.trim().toLowerCase(),
        tokenHash: this.hash(token),
        expiresAt,
      },
    });
    // The link is shown once: only the hash is stored.
    return { id: invite.id, label: invite.label, email: invite.email, expiresAt, url: `${this.webOrigin()}/cadastro?token=${token}` };
  }

  async listInvites(user: AuthUser) {
    const tenant = await this.issuer(user);
    const invites = await this.prisma.signupInvite.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    const tenantIds = invites.map((invite) => invite.usedByTenantId).filter((id): id is string => !!id);
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } })
      : [];
    return invites.map((invite) => ({
      id: invite.id,
      label: invite.label,
      email: invite.email,
      status: this.status(invite),
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      usedAt: invite.usedAt,
      tenant: tenants.find((row) => row.id === invite.usedByTenantId) ?? null,
    }));
  }

  async revokeInvite(user: AuthUser, id: string) {
    const tenant = await this.issuer(user);
    const result = await this.prisma.signupInvite.updateMany({
      where: { id, tenantId: tenant.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Convite não encontrado ou já encerrado');
    return { ok: true };
  }

  private async pendingInvite(token: string) {
    const invite = await this.prisma.signupInvite.findUnique({ where: { tokenHash: this.hash(token) } });
    if (!invite || this.status(invite) !== 'PENDING') return null;
    return invite;
  }

  /** What the sign-up page shows before the person fills anything in. */
  async inspect(token: string) {
    const invite = await this.pendingInvite(token);
    if (!invite) throw new NotFoundException(INVALID_INVITE);
    const platform = await this.prisma.tenantBranding.findUnique({ where: { tenantId: invite.tenantId }, select: { productName: true } });
    return {
      label: invite.label,
      email: invite.email,
      expiresAt: invite.expiresAt,
      platformName: platform?.productName ?? this.config.get<string>('PLATFORM_DEFAULT_NAME') ?? 'Klyvero',
    };
  }

  async register(dto: SignupDto) {
    const email = dto.email.trim().toLowerCase();
    const slug = dto.slug.trim().toLowerCase();
    const document = onlyDigits(dto.document);

    const invite = await this.pendingInvite(dto.token);
    if (!invite) throw new BadRequestException(INVALID_INVITE);
    if (invite.email && invite.email !== email) throw new BadRequestException('Use o e-mail para o qual o convite foi emitido');
    if (!isValidBrDocument(document)) throw new BadRequestException('CPF ou CNPJ inválido');
    if (RESERVED_SLUGS.has(slug)) throw new BadRequestException('Este identificador de workspace não está disponível');

    const passwordHash = await argon2.hash(dto.password);
    const companyName = dto.companyName.trim();
    const productName = dto.productName?.trim() || undefined;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Same e-mail registered from two tabs at once: serialize on the address.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;
        if (await tx.user.findFirst({ where: { email }, select: { id: true } })) {
          throw new ConflictException('Já existe um cadastro com este e-mail');
        }
        if (await tx.tenant.findUnique({ where: { legalDocument: document }, select: { id: true } })) {
          throw new ConflictException('Já existe um cadastro com este CPF/CNPJ');
        }
        if (await tx.tenant.findUnique({ where: { slug }, select: { id: true } })) {
          throw new ConflictException('Este identificador de workspace já está em uso');
        }

        // Single use: the first request to flip usedAt wins; a rollback below gives the invite back.
        const claim = await tx.signupInvite.updateMany({
          where: { id: invite.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claim.count !== 1) throw new BadRequestException(INVALID_INVITE);

        const tenant = await tx.tenant.create({
          data: {
            name: companyName,
            slug,
            type: 'RESELLER',
            legalDocument: document,
            parentTenantId: invite.tenantId,
            // Unset brand fields keep inheriting the platform's until the owner fills them in on the Branding screen.
            branding: { create: { inheritFromParent: true, productName, companyName, primaryColor: dto.primaryColor } },
          },
        });
        const user = await tx.user.create({
          data: { tenantId: tenant.id, name: dto.responsibleName.trim(), email, passwordHash, role: 'OWNER' },
        });
        await tx.pipeline.create({ data: { tenantId: tenant.id, ...DEFAULT_PIPELINE } });
        await tx.signupInvite.update({ where: { id: invite.id }, data: { usedByTenantId: tenant.id } });
        return { tenant, user };
      });

      this.welcome(created.user.email, created.user.name, created.tenant.slug, productName ?? companyName);
      return { tenant: { name: created.tenant.name, slug: created.tenant.slug }, user: { email: created.user.email } };
    } catch (error) {
      // A concurrent request took the same document/slug between the checks and the insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe um cadastro com estes dados');
      }
      throw error;
    }
  }

  /** Best effort: the account exists whether or not the mail goes out. */
  private welcome(to: string, name: string, slug: string, brand: string) {
    if (!this.mailer.isConfigured()) return;
    const platform = this.config.get<string>('PLATFORM_DEFAULT_NAME') ?? 'Klyvero';
    void this.mailer
      .send({
        to,
        subject: `Seu workspace ${brand} está pronto`,
        text: `Olá, ${name}.\n\nSeu cadastro no ${platform} foi concluído. Você é o responsável principal do workspace "${slug}" e já pode configurar a sua marca (white label) na tela Branding.\n\nEntre em: ${this.webOrigin()}/login\nWorkspace: ${slug}\nE-mail: ${to}`,
      })
      .catch((error) => this.logger.warn(`Welcome mail not delivered: ${error instanceof Error ? error.message : String(error)}`));
  }
}
