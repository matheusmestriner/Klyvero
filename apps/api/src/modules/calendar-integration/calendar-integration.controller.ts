import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { Public } from '../../common/public.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { CalendarIntegrationService } from './calendar-integration.service';
import { ConfigService } from '@nestjs/config';

@Feature('calendar') @Controller('calendar/google')
export class CalendarIntegrationController {
  constructor(private readonly calendar: CalendarIntegrationService, private readonly config: ConfigService) {}
  @Get('url') url(@CurrentUser() user: AuthUser) { return this.calendar.connectUrl(user.tenantId, user.sub); }
  @Get('status') status(@CurrentUser() user: AuthUser) { return this.calendar.status(user.tenantId); }
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.SDR, UserRole.MEMBER)
  @Post('sync') sync(@CurrentUser() user: AuthUser) { return this.calendar.sync(user.tenantId); }
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post('disconnect') disconnect(@CurrentUser() user: AuthUser) { return this.calendar.disconnect(user.tenantId); }
  @Post('events/:id/sync') syncEvent(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.calendar.syncEvent(user.tenantId, id); }

  // The browser lands here from Google, so failures must redirect back to the app
  // (the calendar page reads ?google=connected|failed|invalid-state) instead of showing raw JSON.
  @Public() @Get('callback') async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const origin = String(this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000').split(',')[0].trim();
    const back = (result: string) => res.redirect(`${origin}/app/calendar?google=${result}`);
    try {
      const tenantId = await this.calendar.callback(code, state);
      await this.calendar.sync(tenantId).catch(() => undefined);
      return back('connected');
    } catch (error) {
      const invalidState = error instanceof BadRequestException && /state/i.test(error.message);
      return back(invalidState ? 'invalid-state' : 'failed');
    }
  }
}
