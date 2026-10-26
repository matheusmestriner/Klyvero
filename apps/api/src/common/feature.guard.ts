import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../infra/prisma/prisma.service';
import { FEATURE_KEY } from './feature.decorator';
import { AuthUser } from './auth.types';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const key = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!key) return true;
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) return true;

    const tenantIds: string[] = [];
    let current = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, parentTenantId: true },
    });
    while (current) {
      tenantIds.unshift(current.id);
      if (!current.parentTenantId) break;
      current = await this.prisma.tenant.findUnique({
        where: { id: current.parentTenantId },
        select: { id: true, parentTenantId: true },
      });
    }

    const rows = await this.prisma.tenantFeature.findMany({ where: { tenantId: { in: tenantIds }, key } });
    if (rows.some((row) => !row.enabled)) {
      throw new ForbiddenException(`Feature '${key}' is disabled by tenant policy`);
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId: user.tenantId },
      include: { plan: true },
    });

    if (subscription) {
      const entitledStatuses = new Set(['active', 'trialing']);
      if (!entitledStatuses.has(subscription.status) && key !== 'billing') {
        throw new ForbiddenException(`Feature '${key}' requires an active subscription`);
      }
    }

    const planFeatures = subscription?.plan?.features as Record<string, unknown> | null | undefined;
    if (planFeatures && planFeatures[key] === false) {
      throw new ForbiddenException(`Feature '${key}' is not included in the active plan`);
    }
    return true;
  }
}
