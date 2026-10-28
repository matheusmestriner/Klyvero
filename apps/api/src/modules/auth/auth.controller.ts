import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../../common/public.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthUser } from '../../common/auth.types';
import { AuthService } from './auth.service';
import { BootstrapDto, ForgotPasswordDto, LoginDto, OwnerRecoveryDto, ResetPasswordDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'none' as const,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      path: '/api/v1/auth',
      maxAge: Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 30) * 86_400_000,
      priority: 'high' as const,
    };
  }

  private cookie(res: Response, value: string) {
    res.cookie('klyvero_refresh', value, this.cookieOptions());
  }

  private noStore(res: Response) {
    res.setHeader('cache-control', 'no-store, max-age=0');
    res.setHeader('pragma', 'no-cache');
  }

  private assertBrowserOrigin(req: Request) {
    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    const allowed = String(this.config.get('WEB_ORIGIN') ?? 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => new URL(value).origin);

    if (typeof origin === 'string' && !allowed.includes(origin)) {
      throw new ForbiddenException('Cross-site authentication request blocked');
    }
    if (!origin && fetchSite === 'cross-site') {
      throw new ForbiddenException('Cross-site authentication request blocked');
    }
  }

  @Public()
  @Post('bootstrap')
  async bootstrap(@Body() dto: BootstrapDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertBrowserOrigin(req);
    this.noStore(res);
    return this.auth.bootstrap(dto);
  }

  @Public()
  @Get('bootstrap/status')
  async bootstrapStatus(@Res({ passthrough: true }) res: Response) {
    this.noStore(res);
    return this.auth.bootstrapStatus();
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertBrowserOrigin(req);
    this.noStore(res);
    return this.auth.forgotPassword(dto, { ip: req.ip });
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertBrowserOrigin(req);
    this.noStore(res);
    return this.auth.resetPassword(dto);
  }

  @Public()
  @Post('owner-recovery')
  async ownerRecovery(@Body() dto: OwnerRecoveryDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertBrowserOrigin(req);
    this.noStore(res);
    return this.auth.ownerRecovery(dto, { ip: req.ip });
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertBrowserOrigin(req);
    this.noStore(res);
    const out = await this.auth.login(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
    this.cookie(res, out.refreshToken);
    const { refreshToken, ...safe } = out;
    return safe;
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertBrowserOrigin(req);
    this.noStore(res);
    const out = await this.auth.refresh(req.cookies?.klyvero_refresh, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.cookie(res, out.refreshToken);
    const { refreshToken, ...safe } = out;
    return safe;
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertBrowserOrigin(req);
    this.noStore(res);
    const out = await this.auth.logout(req.cookies?.klyvero_refresh);
    res.clearCookie('klyvero_refresh', {
      path: '/api/v1/auth',
      sameSite: 'none',
      secure: this.config.get('COOKIE_SECURE') === 'true',
    });
    return out;
  }

  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthUser) {
    if (user.authType === 'API_KEY') throw new ForbiddenException();
    return this.auth.logoutAll(user.sub);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    if (user.authType === 'API_KEY') throw new ForbiddenException();
    return this.auth.me(user.sub);
  }
}
