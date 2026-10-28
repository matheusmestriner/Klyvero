import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { IcpDto, ImportProspectsDto, ProviderSearchDto } from './dto';
import { ProspectingService } from './prospecting.service';

@Feature('prospecting')
@Controller('prospecting')
export class ProspectingController {
  constructor(private readonly service: ProspectingService) {}

  @Get('icp') listIcp(@CurrentUser() user: AuthUser) { return this.service.listIcp(user.tenantId); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR)
  @Post('icp') createIcp(@CurrentUser() user: AuthUser, @Body() dto: IcpDto) { return this.service.createIcp(user.tenantId, dto); }
  @Get('prospects') prospects(@CurrentUser() user: AuthUser, @Query('status') status?: string) { return this.service.listProspects(user.tenantId, status); }
  @Get('jobs') jobs(@CurrentUser() user: AuthUser) { return this.service.listJobs(user.tenantId); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR)
  @Post('import') importRows(@CurrentUser() user: AuthUser, @Body() dto: ImportProspectsDto, @Query('icpId') icpId?: string) { return this.service.import(user.tenantId, dto, icpId); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR)
  @Post('search') search(@CurrentUser() user: AuthUser, @Body() dto: ProviderSearchDto) { return this.service.providerSearch(user.tenantId, dto); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR)
  @Post('prospects/:id/convert') convert(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.convert(user.tenantId, id); }
}
