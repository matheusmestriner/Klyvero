import { Module } from '@nestjs/common';
import { ProspectingController } from './prospecting.controller';
import { ProspectingService } from './prospecting.service';

@Module({ controllers: [ProspectingController], providers: [ProspectingService], exports: [ProspectingService] })
export class ProspectingModule {}
