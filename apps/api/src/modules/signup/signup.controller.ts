import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { assertBrowserOrigin } from '../../common/browser-origin';
import { Public } from '../../common/public.decorator';
import { InviteTokenDto, SignupDto } from './dto';
import { SignupService } from './signup.service';

/** Public: the invitee opens the link, sees who it is for and registers once. */
@Controller('signup')
export class SignupController {
  constructor(private readonly signup: SignupService, private readonly config: ConfigService) {}

  @Public()
  @Post('invite/check')
  @HttpCode(200)
  check(@Body() dto: InviteTokenDto, @Req() req: Request) {
    assertBrowserOrigin(req, this.config);
    return this.signup.inspect(dto.token);
  }

  @Public()
  @Post()
  register(@Body() dto: SignupDto, @Req() req: Request) {
    assertBrowserOrigin(req, this.config);
    return this.signup.register(dto);
  }
}
