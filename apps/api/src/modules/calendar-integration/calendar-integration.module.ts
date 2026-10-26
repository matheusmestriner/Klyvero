import { Module } from '@nestjs/common';
import { CalendarIntegrationController } from './calendar-integration.controller';
import { CalendarIntegrationService } from './calendar-integration.service';
@Module({ controllers: [CalendarIntegrationController], providers: [CalendarIntegrationService], exports: [CalendarIntegrationService] })
export class CalendarIntegrationModule {}
