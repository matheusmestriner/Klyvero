import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { TenantsService } from './tenants.service';
import {
  CreateDomainDto,
  CreateTenantDto,
  CreateUserDto,
  UpdateFeatureDto,
  UpdateTenantDto,
} from './dto';

@Controller('tenants')
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tenants.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantDto) {
    return this.tenants.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenants.update(user, id, dto);
  }

  @Get(':id/users')
  users(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenants.users(user, id);
  }

  @Post(':id/users')
  createUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.tenants.createUser(user, id, dto);
  }

  @Get(':id/features')
  features(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenants.features(user, id);
  }

  @Patch(':id/features/:key')
  feature(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() dto: UpdateFeatureDto,
  ) {
    return this.tenants.feature(user, id, key, dto);
  }

  @Get(':id/domains')
  domains(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenants.domains(user, id);
  }

  @Post(':id/domains')
  createDomain(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateDomainDto,
  ) {
    return this.tenants.createDomain(user, id, dto);
  }

  @Post(':id/domains/:domainId/verify')
  verifyDomain(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('domainId') domainId: string,
  ) {
    return this.tenants.verifyDomain(user, id, domainId);
  }

  @Post(':id/domains/:domainId/primary')
  primaryDomain(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('domainId') domainId: string,
  ) {
    return this.tenants.setPrimaryDomain(user, id, domainId);
  }
}
