import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { WhatsappConnectDto } from './dto/connect.dto';
import { SendWhatsappMessageDto } from './dto/send-message.dto';
import { WhatsappInternalEventDto } from './dto/internal-event.dto';
import { digitsOf, phoneKey } from '../../common/phone';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  private baseUrl() {
    const configured = this.config.get<string>('WHATSAPP_SERVICE_URL');
    const hostport = this.config.get<string>('WHATSAPP_SERVICE_HOSTPORT');
    return configured ?? (hostport ? `http://${hostport}` : 'http://localhost:8090');
  }

  private async req(path: string, init?: RequestInit) {
    try {
      const response = await fetch(`${this.baseUrl()}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-internal-token': this.config.get('WHATSAPP_INTERNAL_TOKEN') ?? '', ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1000);
        this.logger.warn(`WhatsApp service ${response.status}: ${detail}`);
        throw new Error(`upstream ${response.status}`);
      }
      return response.json();
    } catch (error) {
      this.logger.error(`WhatsApp request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      throw new ServiceUnavailableException('WhatsApp service is temporarily unavailable');
    }
  }

  async connect(tenantId: string, dto: WhatsappConnectDto) {
    const out: any = await this.req('/v1/sessions/connect', { method: 'POST', body: JSON.stringify({ tenantId, sessionId: dto.sessionId }) });
    await this.prisma.whatsappConnection.upsert({
      where: { tenantId_sessionId: { tenantId, sessionId: dto.sessionId } },
      create: { tenantId, sessionId: dto.sessionId, displayName: dto.displayName, connected: !!out.connected, loggedIn: !!out.loggedIn },
      update: { displayName: dto.displayName, connected: !!out.connected, loggedIn: !!out.loggedIn },
    });
    return out;
  }

  async status(tenantId: string, sessionId: string) {
    const owned = await this.prisma.whatsappConnection.findFirst({ where: { tenantId, sessionId } });
    if (!owned) return { connected: false, loggedIn: false };
    const out: any = await this.req(`/v1/sessions/${encodeURIComponent(tenantId)}/${encodeURIComponent(sessionId)}/status`);
    await this.prisma.whatsappConnection.update({ where: { tenantId_sessionId: { tenantId, sessionId } }, data: { connected: !!out.connected, loggedIn: !!out.loggedIn } });
    return out;
  }

  async qr(tenantId: string, sessionId: string) {
    const owned = await this.prisma.whatsappConnection.findFirst({ where: { tenantId, sessionId }, select: { id: true } });
    if (!owned) throw new NotFoundException('WhatsApp session not found');
    return this.req(`/v1/sessions/${encodeURIComponent(tenantId)}/${encodeURIComponent(sessionId)}/qr`);
  }

  async sendText(tenantId: string, dto: SendWhatsappMessageDto) {
    const owned = await this.prisma.whatsappConnection.findFirst({ where: { tenantId, sessionId: dto.sessionId } });
    if (!owned) throw new NotFoundException('WhatsApp session not registered');
    const out: any = await this.req('/v1/messages/text', { method: 'POST', body: JSON.stringify({ tenantId, ...dto }) });
    const phone = dto.to.replace(/\D/g, '');
    let contact = await this.prisma.contact.findFirst({ where: { tenantId, phone } });
    if (!contact) contact = await this.prisma.contact.create({ data: { tenantId, phone } });
    let thread = await this.prisma.messageThread.findFirst({ where: { tenantId, contactId: contact.id, channel: 'WHATSAPP', closed: false } });
    if (!thread) thread = await this.prisma.messageThread.create({ data: { tenantId, contactId: contact.id, channel: 'WHATSAPP', externalKey: phone } });
    await this.prisma.message.create({ data: { tenantId, threadId: thread.id, channel: 'WHATSAPP', direction: 'OUTBOUND', status: 'SENT', externalId: out.id, toAddress: phone, text: dto.text, sentAt: new Date() } });
    await this.prisma.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
    return out;
  }

  /**
   * Leads are stored however the user typed the number ("+55 (11) 99999-0000"), while WhatsApp
   * reports digits only, sometimes without the Brazilian ninth digit. Compare canonical keys.
   */
  private async leadsByPhone(tenantId: string, phone: string) {
    const key = phoneKey(phone);
    if (key.length < 8) return [];
    const tail = key.slice(-8);
    const candidates = await this.prisma.$queryRaw<{ id: string; phone: string }[]>`
      SELECT id, phone FROM "Lead"
       WHERE "tenantId" = ${tenantId}::uuid
         AND phone IS NOT NULL
         AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${'%' + tail.replace(/\D/g, '')}`;
    return candidates.filter((candidate) => phoneKey(digitsOf(candidate.phone)) === key);
  }

  async handleEvent(event: WhatsappInternalEventDto) {
    const { tenantId, sessionId } = event;
    const connection = await this.prisma.whatsappConnection.findFirst({ where: { tenantId, sessionId } });
    if (!connection) return { ignored: true };
    if (event.type === 'connected') {
      await this.prisma.whatsappConnection.update({ where: { tenantId_sessionId: { tenantId, sessionId } }, data: { connected: true, loggedIn: true } });
      return { ok: true };
    }
    if (event.type === 'logged_out') {
      await this.prisma.whatsappConnection.update({ where: { tenantId_sessionId: { tenantId, sessionId } }, data: { connected: false, loggedIn: false, metadata: { reason: event.reason ?? null } } });
      return { ok: true };
    }
    const externalId = event.id ?? '';
    if (externalId && await this.prisma.message.findFirst({ where: { tenantId, externalId } })) return { duplicate: true };
    const rawFrom = event.from || event.chat || '';
    const phone = rawFrom.split('@')[0].replace(/\D/g, '');
    if (!phone) return { ignored: true };
    let contact = await this.prisma.contact.findFirst({ where: { tenantId, phone } });
    if (!contact) contact = await this.prisma.contact.create({ data: { tenantId, phone, firstName: event.pushName || undefined } });
    let thread = await this.prisma.messageThread.findFirst({ where: { tenantId, contactId: contact.id, channel: 'WHATSAPP', closed: false } });
    if (!thread) thread = await this.prisma.messageThread.create({ data: { tenantId, contactId: contact.id, channel: 'WHATSAPP', externalKey: phone } });
    const parsed = event.timestamp ? new Date(event.timestamp) : new Date();
    const receivedAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    let message;
    try {
      message = await this.prisma.message.create({ data: { tenantId, threadId: thread.id, channel: 'WHATSAPP', direction: 'INBOUND', status: 'RECEIVED', externalId: externalId || undefined, fromAddress: phone, text: event.text ?? '', receivedAt, metadata: { sessionId } } });
    } catch (error) {
      if (externalId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { duplicate: true };
      }
      throw error;
    }
    await this.prisma.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: receivedAt } });
    const leads = await this.leadsByPhone(tenantId, phone);
    if (leads.length) {
      const leadIds = leads.map((lead) => lead.id);
      await this.prisma.lead.updateMany({ where: { tenantId, id: { in: leadIds } }, data: { status: 'REPLIED' } });
      await this.prisma.sequenceEnrollment.updateMany({ where: { tenantId, leadId: { in: leadIds }, status: { in: ['ACTIVE', 'PAUSED'] } }, data: { status: 'REPLIED', repliedAt: receivedAt, nextRunAt: null } });
      await Promise.all(leads.map((lead) => this.prisma.leadActivity.create({ data: { tenantId, leadId: lead.id, type: 'whatsapp.received', title: 'Resposta recebida no WhatsApp', metadata: { messageId: message.id } } }).catch(() => undefined)));
    }
    return { ok: true, messageId: message.id };
  }
}
