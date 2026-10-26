import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  private period(date = new Date()) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  async getLimit(tenantId: string, key: string): Promise<number | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (subscription && !new Set(['active', 'trialing']).has(subscription.status)) {
      throw new ForbiddenException('Usage requires an active subscription');
    }
    const limits = subscription?.plan?.limits as Record<string, unknown> | null | undefined;
    const value = limits?.[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  async assertAndIncrement(tenantId: string, key: string, amount = 1) {
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000) {
      throw new BadRequestException('Invalid usage increment');
    }
    const period = this.period();

    // Serializes each tenant/quota bucket inside PostgreSQL. This closes the
    // check-then-increment race that can otherwise overshoot a quota under high concurrency.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`${key}:${period}`}))`;

      const subscription = await tx.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });
      if (subscription && !new Set(['active', 'trialing']).has(subscription.status)) {
        throw new ForbiddenException('Usage requires an active subscription');
      }
      const limits = subscription?.plan?.limits as Record<string, unknown> | null | undefined;
      const rawLimit = limits?.[key];
      const limit = typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : null;

      const current = await tx.usageCounter.findUnique({
        where: { tenantId_key_period: { tenantId, key, period } },
      });
      const next = (current?.value ?? 0) + amount;
      if (limit !== null && next > limit) {
        throw new ForbiddenException(`Monthly quota exceeded for ${key}`);
      }

      return tx.usageCounter.upsert({
        where: { tenantId_key_period: { tenantId, key, period } },
        create: { tenantId, key, period, value: amount },
        update: { value: { increment: amount } },
      });
    });
  }

  list(tenantId: string) {
    return this.prisma.usageCounter.findMany({
      where: { tenantId },
      orderBy: [{ period: 'desc' }, { key: 'asc' }],
    });
  }
}
