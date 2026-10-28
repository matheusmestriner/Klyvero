import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { WebhooksService } from './webhooks.service';
import { WebhookDto } from './dto';

@Feature('integrations') @Roles(UserRole.OWNER, UserRole.ADMIN)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.webhooks.list(user.tenantId); }
  @Post() create(@CurrentUser() user: AuthUser, @Body() dto: WebhookDto) { return this.webhooks.create(user.tenantId, dto); }
  @Get('deliveries') deliveries(@CurrentUser() user: AuthUser) { return this.webhooks.deliveries(user.tenantId); }
  @Post(':id/test') test(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.webhooks.test(user.tenantId, id); }
}
