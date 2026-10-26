import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthUser } from '../../common/auth.types';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RegisterDeviceDto, UnregisterDeviceDto } from './devices.dto';

/** A phone registers its Expo push token after login and removes it on logout. */
@Controller('devices')
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  private person(user: AuthUser) {
    if (user.authType === 'API_KEY') throw new ForbiddenException('Devices belong to a user, not an API key');
    return user;
  }

  @Post()
  async register(@CurrentUser() current: AuthUser, @Body() dto: RegisterDeviceDto) {
    const user = this.person(current);
    // A token follows the person who logged in last (shared or handed-over phones).
    await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: { tenantId: user.tenantId, userId: user.sub, token: dto.token, platform: dto.platform, deviceName: dto.deviceName },
      update: { tenantId: user.tenantId, userId: user.sub, platform: dto.platform, deviceName: dto.deviceName, lastSeenAt: new Date() },
    });
    return { ok: true };
  }

  @Post('unregister')
  async unregister(@CurrentUser() current: AuthUser, @Body() dto: UnregisterDeviceDto) {
    const user = this.person(current);
    await this.prisma.pushDevice.deleteMany({ where: { token: dto.token, userId: user.sub } });
    return { ok: true };
  }
}
