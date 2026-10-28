import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { SequenceWorker } from './sequence.worker';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [EmailModule, WhatsappModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, SequenceWorker],
  exports: [CampaignsService],
})
export class CampaignsModule {}
