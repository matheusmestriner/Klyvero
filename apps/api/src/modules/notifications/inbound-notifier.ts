import { Injectable, Logger } from '@nestjs/common';
import { PushService } from '../push/push.service';
import { NotificationsService } from './notifications.service';

export type InboundMessageInfo = {
  channel: 'WHATSAPP' | 'EMAIL';
  threadId: string;
  from: string;
  preview?: string | null;
};

/** Tells the workspace about a new inbound message: in-app notification (web bell) and push (mobile). */
@Injectable()
export class InboundNotifier {
  private readonly logger = new Logger(InboundNotifier.name);

  constructor(private readonly notifications: NotificationsService, private readonly push: PushService) {}

  /** Never throws: an inbound message must be stored even if notifying fails. */
  async messageReceived(tenantId: string, info: InboundMessageInfo) {
    const title = `Nova mensagem de ${info.from}`;
    const body = (info.preview ?? '').replace(/\s+/g, ' ').trim().slice(0, 140) || undefined;
    try {
      await this.notifications.create(tenantId, title, body, 'INFO');
      await this.push.notifyTenant(tenantId, { title, body, data: { type: 'message', channel: info.channel, threadId: info.threadId } });
    } catch (error) {
      this.logger.warn(`Could not notify inbound message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
