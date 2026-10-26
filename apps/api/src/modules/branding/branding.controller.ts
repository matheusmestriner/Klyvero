import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Public } from '../../common/public.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { Feature } from '../../common/feature.decorator';
import { AuthUser } from '../../common/auth.types';
import { TenantAccessService } from '../../common/tenant.service';
import { BrandingService } from './branding.service';
import { BrandingDto } from './dto';

@Controller('branding')
export class BrandingController {
  constructor(
    private readonly branding: BrandingService,
    private readonly access: TenantAccessService,
  ) {}

  @Public()
  @Get('resolve/domain/:hostname')
  domain(@Param('hostname') hostname: string) {
    return this.branding.resolveByDomain(hostname);
  }

  // Reading inherited branding is always allowed for an authenticated user.
  // The white_label feature controls editing/administration, not presentation.
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.branding.resolveTenantBranding(user.tenantId);
  }

  @Feature('white_label')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Put('me')
  put(@CurrentUser() user: AuthUser, @Body() dto: BrandingDto) {
    return this.branding.update(user.tenantId, dto);
  }

  @Feature('white_label')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get('tenant/:tenantId')
  async tenant(
    @CurrentUser() user: AuthUser,
    @Param('tenantId') tenantId: string,
  ) {
    await this.access.assertTenant(user, tenantId);
    return this.branding.resolveTenantBranding(tenantId);
  }

  @Feature('white_label')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Put('tenant/:tenantId')
  async updateTenant(
    @CurrentUser() user: AuthUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: BrandingDto,
  ) {
    await this.access.assertTenant(user, tenantId);
    return this.branding.update(tenantId, dto);
  }
}
