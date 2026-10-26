import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import nodemailer from 'nodemailer';
import { Prisma, SuppressionReason } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { RedisService } from '../../infra/redis/redis.service';
import { NetworkSafetyService } from '../../infra/security/network-safety.service';
import { constantTimeSecretEquals } from '../../common/constant-time';
import { UsageService } from '../usage/usage.service';
import { InboundEmailDto, MailboxDto, SendEmailDto } from './dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly usage: UsageService,
    private readonly redis: RedisService,
    private readonly network: NetworkSafetyService,
  ) {}

  listMailboxes(tenantId: string) {
    return this.prisma.emailMailbox.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        fromAddress: true,
        fromName: true,
        replyTo: true,
        active: true,
        lastTestAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMailbox(tenantId: string, dto: MailboxDto) {
    // Validate destination before persisting any credential. Private/local SMTP
    // hosts are allowed only in non-production when explicitly enabled.
    await this.network.resolveHost(dto.host, 'smtp');

    let secretId: string | undefined;
    if (dto.password) {
      const encrypted = this.crypto.encrypt(dto.password);
      const secret = await this.prisma.secret.create({
        data: { tenantId, name: `smtp:${Date.now()}:${dto.fromAddress.toLowerCase()}`, ...encrypted },
      });
      secretId = secret.id;
    }

    try {
      return await this.prisma.emailMailbox.create({
        data: {
          tenantId,
          secretId,
          name: dto.name.trim(),
          host: dto.host.trim().toLowerCase(),
          port: dto.port,
          secure: dto.secure,
          username: dto.username?.trim(),
          fromAddress: dto.fromAddress.toLowerCase(),
          fromName: dto.fromName?.trim(),
          replyTo: dto.replyTo?.toLowerCase(),
        },
        select: {
          id: true,
          name: true,
          host: true,
          port: true,
          secure: true,
          username: true,
          fromAddress: true,
          fromName: true,
          active: true,
        },
      });
    } catch (error) {
      if (secretId) await this.prisma.secret.deleteMany({ where: { id: secretId, tenantId } }).catch(() => undefined);
      throw error;
    }
  }

  private async transport(tenantId: string, mailboxId: string) {
    const mailbox = await this.prisma.emailMailbox.findFirst({
      where: { id: mailboxId, tenantId, active: true },
      include: { secret: true },
    });
    if (!mailbox) throw new NotFoundException('Email mailbox not found');

    const resolved = await this.network.resolveHost(mailbox.host, 'smtp');
    const password = mailbox.secret ? this.crypto.decrypt(mailbox.secret) : undefined;
    const production = this.config.get('NODE_ENV') === 'production';

    return {
      mailbox,
      transporter: nodemailer.createTransport({
        // Pin the validated IP to avoid DNS rebinding between validation and connect.
        host: resolved.address,
        port: mailbox.port,
        secure: mailbox.secure,
        name: mailbox.host,
        requireTLS: production && !mailbox.secure,
        auth: mailbox.username ? { user: mailbox.username, pass: password } : undefined,
        tls: {
          servername: mailbox.host,
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
        },
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      }),
    };
  }

  async testMailbox(tenantId: string, mailboxId: string) {
    const { mailbox, transporter } = await this.transport(tenantId, mailboxId);
    try {
      await transporter.verify();
    } catch (error) {
      this.logger.warn(`SMTP verification failed for mailbox ${mailbox.id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('SMTP verification failed');
    }
    await this.prisma.emailMailbox.update({ where: { id: mailbox.id }, data: { lastTestAt: new Date() } });
    return { ok: true };
  }

  async isSuppressed(tenantId: string, email: string) {
    return !!(await this.prisma.suppressionEntry.findUnique({
      where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
    }));
  }

  async suppress(
    tenantId: string,
    email: string,
    reason: SuppressionReason = 'MANUAL',
    source = 'manual',
  ) {
    return this.prisma.suppressionEntry.upsert({
      where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
      create: { tenantId, email: email.toLowerCase(), reason, source },
      update: { reason, source },
    });
  }

  suppressions(tenantId: string) {
    return this.prisma.suppressionEntry.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  private signingKey() {
    return this.config.get<string>('EMAIL_LINK_SIGNING_SECRET')
      ?? this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private signature(value: string) {
    return createHmac('sha256', this.signingKey()).update(value).digest('base64url');
  }

  unsubscribeToken(tenantId: string, email: string) {
    const payload = Buffer.from(`${tenantId}|${email.toLowerCase()}`).toString('base64url');
    return `${payload}.${this.signature(payload)}`;
  }

  verifyUnsubscribeToken(token: string) {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) throw new BadRequestException('Invalid token');
    const expected = this.signature(payload);
    if (!constantTimeSecretEquals(signature, expected)) throw new BadRequestException('Invalid token');
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const delimiter = decoded.indexOf('|');
    if (delimiter <= 0) throw new BadRequestException('Invalid token');
    const tenantId = decoded.slice(0, delimiter);
    const email = decoded.slice(delimiter + 1);
    if (!tenantId || !email || email.length > 254) throw new BadRequestException('Invalid token');
    return { tenantId, email };
  }

  previewUnsubscribe(token: string) {
    return this.verifyUnsubscribeToken(token);
  }

  async send(tenantId: string, dto: SendEmailDto) {
    const to = dto.to.toLowerCase();
    if (dto.leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, tenantId }, select: { id: true } });
      if (!lead) throw new BadRequestException('Lead does not belong to this tenant');
    }
    if (await this.isSuppressed(tenantId, to)) throw new BadRequestException('Recipient is suppressed');

    await this.usage.assertAndIncrement(tenantId, 'emails', 1);
    const { mailbox, transporter } = await this.transport(tenantId, dto.mailboxId);

    let contact = await this.prisma.contact.findFirst({ where: { tenantId, email: to } });
    if (!contact) contact = await this.prisma.contact.create({ data: { tenantId, email: to } });
    let thread = await this.prisma.messageThread.findFirst({
      where: { tenantId, contactId: contact.id, channel: 'EMAIL', closed: false },
    });
    if (!thread) {
      thread = await this.prisma.messageThread.create({
        data: { tenantId, contactId: contact.id, channel: 'EMAIL', subject: dto.subject, externalKey: to },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        tenantId,
        threadId: thread.id,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        status: 'QUEUED',
        fromAddress: mailbox.fromAddress,
        toAddress: to,
        subject: dto.subject,
        text: dto.text,
        html: dto.html,
      },
    });

    const publicUrl = this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000';
    const openSig = this.signature(message.id);
    const unsubscribe = `${publicUrl}/api/v1/email/unsubscribe/${this.unsubscribeToken(tenantId, to)}`;
    const html = dto.html
      ? `${dto.html}<p style="font-size:12px;color:#888"><a href="${unsubscribe}">Cancelar inscrição</a></p><img alt="" width="1" height="1" src="${publicUrl}/api/v1/email/track/open/${message.id}/${openSig}"/>`
      : undefined;

    try {
      const result = await transporter.sendMail({
        from: mailbox.fromName ? `${mailbox.fromName} <${mailbox.fromAddress}>` : mailbox.fromAddress,
        replyTo: mailbox.replyTo ?? undefined,
        to,
        subject: dto.subject,
        text: dto.text,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubscribe}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: 'SENT', externalId: result.messageId, sentAt: new Date() },
      });
      await this.prisma.messageThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date(), subject: dto.subject },
      });
      if (dto.leadId) {
        await this.prisma.leadActivity.create({
          data: {
            tenantId,
            leadId: dto.leadId,
            type: 'email.sent',
            title: `E-mail enviado: ${dto.subject}`,
            metadata: { messageId: message.id },
          },
        });
      }
      return { messageId: message.id, externalId: result.messageId };
    } catch (error) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: 'FAILED', metadata: { error: 'smtp-send-failed' } },
      });
      this.logger.warn(`SMTP send failed for mailbox ${mailbox.id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('SMTP send failed');
    }
  }

  async recordOpen(messageId: string, signature: string, meta: { ip?: string; userAgent?: string }) {
    if (!constantTimeSecretEquals(this.signature(messageId), signature)) throw new BadRequestException();
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException();

    // Analytics only needs a unique open per message. This also prevents a leaked
    // tracking URL from becoming an unbounded database-write amplification vector.
    let shouldRecord = true;
    try {
      const accepted = await this.redis.client.set(`email:open:${messageId}`, '1', 'EX', 90 * 86_400, 'NX');
      shouldRecord = accepted === 'OK';
    } catch {
      const existing = await this.prisma.trackingEvent.findFirst({
        where: { tenantId: message.tenantId, messageId, type: 'OPEN' },
        select: { id: true },
      });
      shouldRecord = !existing;
    }
    if (!shouldRecord) return;

    try {
      await this.prisma.trackingEvent.create({
        data: { tenantId: message.tenantId, messageId, type: 'OPEN', ip: meta.ip, userAgent: meta.userAgent },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }

  async unsubscribe(token: string) {
    const { tenantId, email } = this.verifyUnsubscribeToken(token);
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, status: 'ACTIVE' }, select: { id: true } });
    if (!tenant) throw new BadRequestException('Invalid token');
    await this.suppress(tenantId, email, 'UNSUBSCRIBE', 'public-link');
    return { ok: true, email };
  }

  async inbound(dto: InboundEmailDto) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: dto.tenantId, status: 'ACTIVE' } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (dto.externalId) {
      const duplicate = await this.prisma.message.findFirst({
        where: { tenantId: dto.tenantId, externalId: dto.externalId, channel: 'EMAIL', direction: 'INBOUND' },
      });
      if (duplicate) return duplicate;
    }

    const email = dto.from.toLowerCase();
    let contact = await this.prisma.contact.findFirst({ where: { tenantId: dto.tenantId, email } });
    if (!contact) contact = await this.prisma.contact.create({ data: { tenantId: dto.tenantId, email } });
    let thread = await this.prisma.messageThread.findFirst({
      where: { tenantId: dto.tenantId, contactId: contact.id, channel: 'EMAIL', closed: false },
    });
    if (!thread) {
      thread = await this.prisma.messageThread.create({
        data: {
          tenantId: dto.tenantId,
          contactId: contact.id,
          channel: 'EMAIL',
          externalKey: email,
          subject: dto.subject,
        },
      });
    }

    let message;
    try {
      message = await this.prisma.message.create({
        data: {
          tenantId: dto.tenantId, threadId: thread.id, channel: 'EMAIL', direction: 'INBOUND', status: 'RECEIVED',
          externalId: dto.externalId, fromAddress: email, toAddress: dto.to.toLowerCase(), subject: dto.subject,
          text: dto.text, html: dto.html, receivedAt: new Date(),
        },
      });
    } catch (error) {
      if (dto.externalId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.message.findFirst({
          where: { tenantId: dto.tenantId, channel: 'EMAIL', direction: 'INBOUND', externalId: dto.externalId },
        });
        if (duplicate) return duplicate;
      }
      throw error;
    }
    await this.prisma.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

    const leads = await this.prisma.lead.findMany({ where: { tenantId: dto.tenantId, email } });
    if (leads.length) {
      await this.prisma.lead.updateMany({ where: { tenantId: dto.tenantId, email }, data: { status: 'REPLIED' } });
      await this.prisma.sequenceEnrollment.updateMany({
        where: {
          tenantId: dto.tenantId,
          leadId: { in: leads.map((lead) => lead.id) },
          status: 'ACTIVE',
        },
        data: { status: 'REPLIED', repliedAt: new Date(), nextRunAt: null },
      });
    }
    return message;
  }
}
