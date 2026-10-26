import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, EnrollDto, EnrollmentsQueryDto, SequenceStepDto, UpdateCampaignDto } from './dto';

const MANAGE = [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR];
const RUN = [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER];

@Feature('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get() list(@CurrentUser() user: AuthUser) { return this.campaigns.list(user.tenantId); }
  @Roles(...MANAGE) @Post() create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampaignDto) { return this.campaigns.create(user.tenantId, dto); }
  @Roles(...MANAGE) @Patch(':id') update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto) { return this.campaigns.update(user.tenantId, id, dto); }
  @Roles(...RUN) @Delete(':id') remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.campaigns.remove(user.tenantId, id); }

  @Roles(...MANAGE) @Post(':id/steps') step(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SequenceStepDto) { return this.campaigns.addStep(user.tenantId, id, dto); }
  @Roles(...MANAGE) @Delete(':id/steps/:stepId') removeStep(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('stepId', ParseUUIDPipe) stepId: string) { return this.campaigns.removeStep(user.tenantId, id, stepId); }

  @Roles(...MANAGE) @Post(':id/enroll') enroll(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollDto) { return this.campaigns.enroll(user.tenantId, id, dto); }
  @Roles(...RUN) @Post(':id/start') start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.campaigns.start(user.tenantId, id); }
  @Roles(...RUN) @Post(':id/pause') pause(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.campaigns.pause(user.tenantId, id); }

  @Get(':id/enrollments') enrollments(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: EnrollmentsQueryDto) { return this.campaigns.enrollments(user.tenantId, id, query); }
  @Roles(...MANAGE) @Post(':id/enrollments/:enrollmentId/stop') stopEnrollment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) { return this.campaigns.stopEnrollment(user.tenantId, id, enrollmentId); }
  @Roles(...MANAGE) @Post(':id/enrollments/:enrollmentId/retry') retryEnrollment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) { return this.campaigns.retryEnrollment(user.tenantId, id, enrollmentId); }
}
