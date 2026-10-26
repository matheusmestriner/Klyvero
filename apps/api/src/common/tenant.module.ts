import { Global, Module } from '@nestjs/common';
import { TenantAccessService } from './tenant.service';

@Global()
@Module({
  providers: [TenantAccessService],
  exports: [TenantAccessService],
})
export class TenantAccessModule {}
