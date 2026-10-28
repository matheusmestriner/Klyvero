import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto';

@Controller('api-keys')
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.keys.list(user.tenantId); }
  @Post() create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) { return this.keys.create(user.tenantId, dto); }
  @Post(':id/revoke') revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.keys.revoke(user.tenantId, id); }
}
