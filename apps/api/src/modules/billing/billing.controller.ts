import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { Public } from '../../common/public.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { BillingService } from './billing.service';
import { CheckoutDto, PlanDto } from './dto';

@Feature('billing') @Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('plans') plans() { return this.billing.listPlans(); }
  @Roles(UserRole.OWNER, UserRole.ADMIN) @Post('plans') createPlan(@CurrentUser() user: AuthUser, @Body() dto: PlanDto) { return this.billing.createPlan(user.tenantId, dto); }
  @Get('me') me(@CurrentUser() user: AuthUser) { return this.billing.me(user.tenantId); }
  @Roles(UserRole.OWNER, UserRole.ADMIN) @Post('checkout') checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) { return this.billing.checkout(user.tenantId, dto); }
  @Roles(UserRole.OWNER, UserRole.ADMIN) @Post('portal') portal(@CurrentUser() user: AuthUser) { return this.billing.portal(user.tenantId); }
  @Public() @Post('webhook') webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) { return this.billing.webhook(req.rawBody, signature); }
}
