import { Module } from '@nestjs/common';
import { SignupInvitesController } from './signup-invites.controller';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

@Module({ controllers: [SignupController, SignupInvitesController], providers: [SignupService] })
export class SignupModule {}
