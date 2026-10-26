import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/validate-env';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './infra/prisma/prisma.module';
import { CryptoModule } from './infra/crypto/crypto.module';
import { RedisModule } from './infra/redis/redis.module';
import { QueueModule } from './infra/queue/queue.module';
import { SecurityModule } from './infra/security/security.module';
import { MailModule } from './infra/mail/mail.module';
import { AuthGuard } from './common/auth.guard';
import { RolesGuard } from './common/roles.guard';
import { FeatureGuard } from './common/feature.guard';
import { ScopeGuard } from './common/scope.guard';
import { RateLimitGuard } from './common/rate-limit.guard';
import { PreAuthRateLimitGuard } from './common/pre-auth-rate-limit.guard';
import { AuditInterceptor } from './common/audit.interceptor';
import { TenantAccessModule } from './common/tenant.module';
import { UsageModule } from './modules/usage/usage.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BrandingModule } from './modules/branding/branding.module';
import { CrudModule } from './modules/crud/crud.module';
import { CrmModule } from './modules/crm/crm.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AiModule } from './modules/ai/ai.module';
import { ProspectingModule } from './modules/prospecting/prospecting.module';
import { EmailModule } from './modules/email/email.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { CalendarIntegrationModule } from './modules/calendar-integration/calendar-integration.module';
import { BillingModule } from './modules/billing/billing.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PushModule } from './modules/push/push.module';
import { InboxModule } from './modules/inbox/inbox.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    JwtModule.register({ global: true }),
    PrismaModule, CryptoModule, RedisModule, QueueModule, SecurityModule, MailModule, TenantAccessModule, UsageModule,
    HealthModule, AuthModule, TenantsModule, BrandingModule, CrudModule, CrmModule,
    WhatsappModule, AnalyticsModule, AiModule, ProspectingModule, EmailModule,
    CampaignsModule, WebhooksModule, CalendarIntegrationModule, BillingModule,
    ApiKeysModule, NotificationsModule, PushModule, InboxModule,
  ],
  providers: [
    // Edge limiter intentionally runs before authentication so malformed/invalid
    // credentials cannot bypass throttling by failing inside AuthGuard first.
    { provide: APP_GUARD, useClass: PreAuthRateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    // Principal-aware limiter runs after AuthGuard for authenticated/API-key traffic.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
