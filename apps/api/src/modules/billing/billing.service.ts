import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CheckoutDto, PlanDto } from './dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private stripe() {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) throw new ServiceUnavailableException('Stripe is not configured');
    return new Stripe(key);
  }

  async listPlans() { return this.prisma.plan.findMany({ where: { active: true }, orderBy: { monthlyPrice: 'asc' } }); }

  async createPlan(currentTenantId: string, dto: PlanDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: currentTenantId } });
    if (tenant?.type !== 'PLATFORM') throw new ForbiddenException('Only platform administrators can manage plans');
    return this.prisma.plan.create({ data: { code: dto.code.toLowerCase(), name: dto.name, monthlyPrice: dto.monthlyPrice, stripePriceId: dto.stripePriceId, limits: dto.limits as any, features: dto.features as any } });
  }

  async me(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    const usage = await this.prisma.usageCounter.findMany({ where: { tenantId }, orderBy: { period: 'desc' }, take: 100 });
    return { subscription, usage };
  }

  async checkout(tenantId: string, dto: CheckoutDto) {
    const plan = await this.prisma.plan.findFirst({ where: { id: dto.planId, active: true } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.stripePriceId) throw new BadRequestException('Plan does not have a Stripe price');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException();
    const stripe = this.stripe();
    const current = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (current?.externalSubscriptionId && ['active', 'trialing', 'past_due'].includes(current.status)) {
      throw new BadRequestException('An existing subscription is already managed by Stripe. Use the billing portal for changes.');
    }

    let customerId = current?.externalCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ name: tenant.name, metadata: { tenantId } });
      customerId = customer.id;
    }
    const webOrigin = this.config.get<string>('WEB_ORIGIN')?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: this.config.get<string>('STRIPE_SUCCESS_URL') ?? `${webOrigin}/app/billing?checkout=success`,
      cancel_url: this.config.get<string>('STRIPE_CANCEL_URL') ?? `${webOrigin}/app/billing?checkout=cancel`,
      client_reference_id: tenantId,
      subscription_data: { metadata: { tenantId, planId: plan.id } },
      metadata: { tenantId, planId: plan.id },
    });
    // Security invariant: starting checkout must never grant local entitlements.
    // The plan is persisted only after a signed Stripe subscription webhook proves
    // which price/status Stripe actually created.
    return { url: session.url };
  }

  async portal(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!subscription?.externalCustomerId) throw new BadRequestException('Billing customer does not exist');
    const webOrigin = this.config.get<string>('WEB_ORIGIN')?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const session = await this.stripe().billingPortal.sessions.create({ customer: subscription.externalCustomerId, return_url: `${webOrigin}/app/billing` });
    return { url: session.url };
  }

  private async reserveEvent(eventId: string) {
    try {
      await this.prisma.externalEventReceipt.create({ data: { provider: 'stripe', externalId: eventId } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  async webhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!rawBody || !signature || !secret) throw new BadRequestException('Invalid Stripe webhook request');
    let event: Stripe.Event;
    try {
      event = this.stripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      this.logger.warn(`Rejected Stripe webhook signature: ${error instanceof Error ? error.message : 'invalid signature'}`);
      throw new BadRequestException('Invalid Stripe signature');
    }
    if (!(await this.reserveEvent(event.id))) return { received: true, duplicate: true };

    const object: any = event.data.object;
    const tenantId = object.metadata?.tenantId ?? object.client_reference_id;
    if (!tenantId) return { received: true };
    const tenant = await this.prisma.tenant.findUnique({ where: { id: String(tenantId) }, select: { id: true } });
    if (!tenant) {
      this.logger.warn(`Stripe event ${event.id} references an unknown tenant`);
      return { received: true };
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const stripePriceId = object.items?.data?.[0]?.price?.id;
      if (!stripePriceId) {
        this.logger.warn(`Stripe event ${event.id} does not contain a subscription price`);
        return { received: true };
      }

      // Do not trust planId metadata as the entitlement source of truth. Resolve
      // the local plan from the price Stripe actually attached to the subscription.
      const plan = await this.prisma.plan.findFirst({
        where: { stripePriceId: String(stripePriceId), active: true },
        select: { id: true },
      });
      if (!plan) {
        this.logger.warn(`Stripe event ${event.id} references an unknown or inactive price`);
        return { received: true };
      }

      await this.prisma.subscription.upsert({
        where: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          planId: plan.id,
          status: String(object.status),
          externalCustomerId: String(object.customer),
          externalSubscriptionId: String(object.id),
          currentPeriodEndsAt: object.current_period_end ? new Date(object.current_period_end * 1000) : undefined,
        },
        update: {
          planId: plan.id,
          status: String(object.status),
          externalCustomerId: String(object.customer),
          externalSubscriptionId: String(object.id),
          currentPeriodEndsAt: object.current_period_end ? new Date(object.current_period_end * 1000) : undefined,
        },
      });
    }
    if (event.type === 'customer.subscription.deleted') {
      await this.prisma.subscription.updateMany({ where: { tenantId: tenant.id }, data: { status: 'canceled', currentPeriodEndsAt: new Date() } });
    }
    if (event.type === 'invoice.payment_failed') {
      await this.prisma.subscription.updateMany({ where: { tenantId: tenant.id }, data: { status: 'past_due' } });
    }
    return { received: true };
  }
}
