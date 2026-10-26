import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({ imports: [EmailModule, WhatsappModule], controllers: [InboxController], providers: [InboxService] })
export class InboxModule {}
