import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { AuthUser } from '../../common/auth.types';
import { AnalyticsService } from './analytics.service';

@Feature('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.analytics.summary(user.tenantId);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.analytics.dashboard(user.tenantId);
  }
}
