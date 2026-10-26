import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, EnrollDto, SequenceStepDto } from './dto';

@Feature('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.campaigns.list(user.tenantId); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR) @Post() create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampaignDto) { return this.campaigns.create(user.tenantId, dto); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR) @Post(':id/steps') step(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SequenceStepDto) { return this.campaigns.addStep(user.tenantId, id, dto); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR) @Post(':id/enroll') enroll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EnrollDto) { return this.campaigns.enroll(user.tenantId, id, dto); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER) @Post(':id/start') start(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.campaigns.start(user.tenantId, id); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER) @Post(':id/pause') pause(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.campaigns.pause(user.tenantId, id); }
  @Get(':id/enrollments') enrollments(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.campaigns.enrollments(user.tenantId, id); }
}
