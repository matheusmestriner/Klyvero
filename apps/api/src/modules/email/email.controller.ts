import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { Feature } from '../../common/feature.decorator';
import { Public } from '../../common/public.decorator';
import { Roles } from '../../common/roles.decorator';
import { AuthUser } from '../../common/auth.types';
import { constantTimeSecretEquals } from '../../common/constant-time';
import { EmailService } from './email.service';
import { InboundEmailDto, MailboxDto, SendEmailDto, SuppressDto } from './dto';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}

@Feature('email')
@Controller('email')
export class EmailController {
  constructor(
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  @Get('mailboxes')
  mailboxes(@CurrentUser() user: AuthUser) {
    return this.email.listMailboxes(user.tenantId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post('mailboxes')
  createMailbox(@CurrentUser() user: AuthUser, @Body() dto: MailboxDto) {
    return this.email.createMailbox(user.tenantId, dto);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post('mailboxes/:id/test')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.email.testMailbox(user.tenantId, id);
  }

  @Post('send')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendEmailDto) {
    return this.email.send(user.tenantId, dto);
  }

  @Get('suppressions')
  suppressions(@CurrentUser() user: AuthUser) {
    return this.email.suppressions(user.tenantId);
  }

  @Post('suppressions')
  suppress(@CurrentUser() user: AuthUser, @Body() dto: SuppressDto) {
    return this.email.suppress(user.tenantId, dto.email, dto.reason ?? 'MANUAL');
  }

  @Public()
  @Get('track/open/:messageId/:signature')
  async open(
    @Param('messageId') messageId: string,
    @Param('signature') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.email.recordOpen(messageId, signature, { ip: req.ip, userAgent: req.headers['user-agent'] });
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    res.setHeader('content-type', 'image/gif');
    res.setHeader('cache-control', 'no-store, max-age=0');
    res.send(pixel);
  }

  // GET is confirmation-only. Mutating suppression state on GET allows mail
  // security scanners/prefetchers to unsubscribe recipients accidentally.
  @Public()
  @Get('unsubscribe/:token')
  async unsubscribePreview(@Param('token') token: string, @Res() res: Response) {
    const result = this.email.previewUnsubscribe(token);
    const safeEmail = escapeHtml(result.email);
    res.setHeader('cache-control', 'no-store, max-age=0');
    res.type('html').send(
      `<html><body style="font-family:system-ui;padding:40px"><h2>Cancelar inscrição</h2><p>Confirme para não receber novos e-mails em <strong>${safeEmail}</strong>.</p><form method="post"><button type="submit">Cancelar inscrição</button></form></body></html>`,
    );
  }

  @Public()
  @Post('unsubscribe/:token')
  async unsubscribe(@Param('token') token: string, @Res() res: Response) {
    const result = await this.email.unsubscribe(token);
    const safeEmail = escapeHtml(result.email);
    res.setHeader('cache-control', 'no-store, max-age=0');
    res.type('html').send(
      `<html><body style="font-family:system-ui;padding:40px"><h2>Inscrição cancelada</h2><p>${safeEmail} não receberá novos e-mails desta operação.</p></body></html>`,
    );
  }

  @Public()
  @Post('inbound')
  inbound(@Headers('x-inbound-token') token: string, @Body() dto: InboundEmailDto) {
    const expected = this.config.get<string>('EMAIL_INBOUND_TOKEN');
    if (!constantTimeSecretEquals(token, expected)) throw new UnauthorizedException();
    return this.email.inbound(dto);
  }
}
