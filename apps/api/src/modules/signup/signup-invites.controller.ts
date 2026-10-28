import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../../common/auth.types';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { CreateInviteDto } from './dto';
import { SignupService } from './signup.service';

/** Platform owners/admins issue, list and revoke the single-use links. */
@Controller('signup-invites')
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class SignupInvitesController {
  constructor(private readonly signup: SignupService) {}

  @Post() create(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) { return this.signup.createInvite(user, dto); }
  @Get() list(@CurrentUser() user: AuthUser) { return this.signup.listInvites(user); }
  @Delete(':id') revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.signup.revokeInvite(user, id); }
}
