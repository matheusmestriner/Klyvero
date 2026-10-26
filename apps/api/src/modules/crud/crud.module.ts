import { Module } from '@nestjs/common';
import { CalendarIntegrationModule } from '../calendar-integration/calendar-integration.module';
import { CrudController } from './crud.controller';
import { CrudService } from './crud.service';

@Module({ imports: [CalendarIntegrationModule], controllers: [CrudController], providers: [CrudService] })
export class CrudModule {}
