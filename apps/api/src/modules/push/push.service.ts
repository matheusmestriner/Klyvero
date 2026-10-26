import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type PushMessage = { title: string; body?: string; data?: Record<string, unknown> };

const BATCH = 100;

/** Sends push notifications through Expo's push service to every registered device of a workspace. */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async notifyTenant(tenantId: string, message: PushMessage) {
    if (this.config.get('EXPO_PUSH_ENABLED') === 'false') return;
    const devices = await this.prisma.pushDevice.findMany({
      where: { tenantId, user: { active: true } },
      select: { token: true },
    });
    if (!devices.length) return;

    const url = this.config.get<string>('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN');
    const dead: string[] = [];

    for (let index = 0; index < devices.length; index += BATCH) {
      const chunk = devices.slice(index, index + BATCH);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(chunk.map((device) => ({
            to: device.token,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: 'default',
            channelId: 'messages',
          }))),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          this.logger.warn(`Expo push answered ${response.status}`);
          continue;
        }
        const payload: any = await response.json();
        const tickets: any[] = Array.isArray(payload?.data) ? payload.data : [];
        tickets.forEach((ticket, position) => {
          if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') dead.push(chunk[position].token);
        });
      } catch (error) {
        this.logger.warn(`Expo push failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Uninstalled apps stop receiving pushes; forget their tokens.
    if (dead.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } }).catch(() => undefined);
  }
}
