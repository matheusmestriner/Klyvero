import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappInternalController } from './whatsapp-internal.controller';
import { WhatsappService } from './whatsapp.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [NotificationsModule], controllers: [WhatsappController, WhatsappInternalController], providers: [WhatsappService], exports: [WhatsappService] })
export class WhatsappModule {}
