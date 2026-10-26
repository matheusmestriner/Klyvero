import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { MessagesQueryDto, ReplyDto, ThreadsQueryDto } from './dto';
import { InboxService } from './inbox.service';

// Lighter than GET /inbox (which returns every message of every conversation): built for a phone.
@Controller('inbox/threads')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get() threads(@CurrentUser() user: AuthUser, @Query() query: ThreadsQueryDto) { return this.inbox.threads(user.tenantId, query); }
  @Get(':id/messages') messages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: MessagesQueryDto) { return this.inbox.messages(user.tenantId, id, query); }
  @Post(':id/read') read(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.inbox.markRead(user.tenantId, id); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR, UserRole.MEMBER)
  @Post(':id/reply') reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplyDto) { return this.inbox.reply(user.tenantId, id, dto); }
}
