import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { IS_PUBLIC } from './public.decorator';
import { AuthUser } from './auth.types';
import { PrismaService } from '../infra/prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      return true;
    }

    const request = ctx.switchToHttp().getRequest();
    const authorization = request.headers.authorization as string | undefined;

    if (authorization?.startsWith('Bearer ')) {
      try {
        const claims = await this.jwt.verifyAsync<AuthUser & { tokenType?: string }>(
          authorization.slice(7),
          {
            secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
            algorithms: ['HS256'],
            issuer: this.config.get('JWT_ISSUER') ?? 'klyvero-api',
            audience: this.config.get('JWT_AUDIENCE') ?? 'klyvero-web',
          },
        );
        if (claims.tokenType !== 'access') throw new UnauthorizedException('Invalid token type');

        const user = await this.prisma.user.findUnique({
          where: { id: claims.sub },
          include: { tenant: { select: { status: true } } },
        });
        if (!user?.active || user.tenant.status !== 'ACTIVE') {
          throw new UnauthorizedException('Account disabled');
        }

        request.user = {
          sub: user.id,
          tenantId: user.tenantId,
          role: user.role,
          email: user.email,
          authType: 'JWT',
        } satisfies AuthUser;
        return true;
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error;
        throw new UnauthorizedException('Invalid or expired access token');
      }
    }

    const rawKey = request.headers['x-api-key'] as string | undefined;
    if (rawKey?.startsWith('kly_')) {
      const hash = createHash('sha256').update(rawKey).digest('hex');
      const key = await this.prisma.apiKey.findUnique({
        where: { keyHash: hash },
        include: { tenant: true },
      });

      if (
        !key ||
        !key.active ||
        key.tenant.status !== 'ACTIVE' ||
        (key.expiresAt && key.expiresAt < new Date())
      ) {
        throw new UnauthorizedException('Invalid API key');
      }

      void this.prisma.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);

      request.user = {
        sub: `apikey:${key.id}`,
        tenantId: key.tenantId,
        role: 'MEMBER',
        email: `apikey@${key.tenant.slug}`,
        authType: 'API_KEY',
        scopes: key.scopes,
      } satisfies AuthUser;
      return true;
    }

    throw new UnauthorizedException();
  }
}
