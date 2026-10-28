import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { InboundNotifier } from './inbound-notifier';
@Module({ controllers:[NotificationsController], providers:[NotificationsService, InboundNotifier], exports:[NotificationsService, InboundNotifier] })
export class NotificationsModule {}
