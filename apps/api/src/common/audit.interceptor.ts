import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../infra/prisma/prisma.service';
import { WebhooksService } from '../modules/webhooks/webhooks.service';
import { AuthUser } from './auth.types';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    const method = String(request.method ?? 'GET').toUpperCase();

    if (!user || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((result) => {
        const route = request.route?.path ?? request.url;
        const entityId =
          result && typeof result === 'object' && 'id' in result
            ? String((result as { id?: unknown }).id ?? '') || undefined
            : undefined;

        void this.prisma.auditLog
          .create({
            data: {
              tenantId: user.tenantId,
              actorUserId: user.authType === 'API_KEY' ? null : user.sub,
              action: `${method} ${route}`,
              entity: request.baseUrl ?? undefined,
              entityId,
              ip: request.ip,
              userAgent: request.headers?.['user-agent'],
              metadata:
                user.authType === 'API_KEY'
                  ? { authType: 'API_KEY', apiKeySubject: user.sub }
                  : { authType: 'JWT' },
            },
          })
          .catch(() => undefined);

        // Generic mutation event. Endpoints may subscribe to "api.mutation" or "*".
        void this.webhooks
          .dispatch(user.tenantId, 'api.mutation', {
            method,
            route,
            entityId,
            actor: user.authType === 'API_KEY' ? 'api-key' : user.sub,
          })
          .catch(() => undefined);
      }),
    );
  }
}
