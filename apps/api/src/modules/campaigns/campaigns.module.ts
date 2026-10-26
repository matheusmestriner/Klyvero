import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { SequencePlanner } from './sequence.planner';
import { SequenceScheduler } from './sequence.scheduler';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [EmailModule, WhatsappModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, SequencePlanner, SequenceScheduler],
  exports: [CampaignsService],
})
export class CampaignsModule {}
