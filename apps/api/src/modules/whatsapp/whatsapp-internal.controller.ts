import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/public.decorator';
import { constantTimeSecretEquals } from '../../common/constant-time';
import { WhatsappService } from './whatsapp.service';
import { WhatsappInternalEventDto } from './dto/internal-event.dto';

@Public()
@Controller('internal/whatsapp')
export class WhatsappInternalController {
  constructor(private readonly whatsapp: WhatsappService, private readonly config: ConfigService) {}

  @Post('events')
  event(@Headers('x-internal-token') token: string, @Body() event: WhatsappInternalEventDto) {
    const expected = this.config.get<string>('WHATSAPP_INTERNAL_TOKEN') ?? '';
    if (!token || !expected || !constantTimeSecretEquals(token, expected)) throw new UnauthorizedException();
    return this.whatsapp.handleEvent(event);
  }
}
