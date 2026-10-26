import { Global, Module } from '@nestjs/common';
import { NetworkSafetyService } from './network-safety.service';
import { AuthDefenseService } from './auth-defense.service';

@Global()
@Module({
  providers: [NetworkSafetyService, AuthDefenseService],
  exports: [NetworkSafetyService, AuthDefenseService],
})
export class SecurityModule {}
