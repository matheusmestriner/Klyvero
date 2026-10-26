import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessagesQueryDto, ReplyDto, ThreadsQueryDto } from './dto';

const CONTACT = { id: true, firstName: true, lastName: true, email: true, phone: true } as const;

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private async thread(tenantId: string, id: string) {
    const thread = isUUID(id) ? await this.prisma.messageThread.findFirst({ where: { id, tenantId }, include: { contact: { select: CONTACT } } }) : null;
    if (!thread) throw new NotFoundException('Conversation not found');
    return thread;
  }

  /** Conversations newest first, each with its last message and how many inbound messages are unread. */
  async threads(tenantId: string, query: ThreadsQueryDto) {
    const take = query.take ?? 30;
    const rows = await this.prisma.messageThread.findMany({
      where: {
        tenantId,
        ...(query.channel ? { channel: query.channel } : {}),
        lastMessageAt: { not: null, ...(query.before ? { lt: new Date(query.before) } : {}) },
      },
      include: {
        contact: { select: CONTACT },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, direction: true, text: true, subject: true, status: true, createdAt: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take,
    });
    const unread = rows.length
      ? await this.prisma.message.groupBy({
          by: ['threadId'],
          where: { tenantId, threadId: { in: rows.map((row) => row.id) }, direction: 'INBOUND', readAt: null },
          _count: { _all: true },
        })
      : [];
    const items = rows.map(({ messages, ...thread }) => ({
      ...thread,
      lastMessage: messages[0] ?? null,
      unread: unread.find((group) => group.threadId === thread.id)?._count._all ?? 0,
    }));
    return { items, nextBefore: rows.length === take ? rows[rows.length - 1].lastMessageAt : null };
  }

  /** The latest `take` messages, oldest first, so a chat can render them as they are. */
  async messages(tenantId: string, threadId: string, query: MessagesQueryDto) {
    const thread = await this.thread(tenantId, threadId);
    const take = query.take ?? 50;
    const rows = await this.prisma.message.findMany({
      where: { tenantId, threadId: thread.id, ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: { id: true, direction: true, channel: true, status: true, subject: true, text: true, fromAddress: true, toAddress: true, createdAt: true, sentAt: true, receivedAt: true, readAt: true },
    });
    const hasMore = rows.length > take;
    return { thread, items: rows.slice(0, take).reverse(), hasMore };
  }

  async markRead(tenantId: string, threadId: string) {
    const thread = await this.thread(tenantId, threadId);
    const result = await this.prisma.message.updateMany({ where: { tenantId, threadId: thread.id, direction: 'INBOUND', readAt: null }, data: { readAt: new Date() } });
    return { read: result.count };
  }

  /** Answers on the same channel the conversation is on, so the app does not need to know about sessions or mailboxes. */
  async reply(tenantId: string, threadId: string, dto: ReplyDto) {
    const thread = await this.thread(tenantId, threadId);

    if (thread.channel === 'WHATSAPP') {
      const to = thread.contact?.phone ?? thread.externalKey;
      if (!to) throw new BadRequestException('Esta conversa não tem um número de destino');
      const session = await this.prisma.whatsappConnection.findFirst({ where: { tenantId, loggedIn: true }, orderBy: { updatedAt: 'desc' } });
      if (!session) throw new BadRequestException('Nenhuma sessão de WhatsApp conectada');
      await this.whatsapp.sendText(tenantId, { sessionId: session.sessionId, to, text: dto.text });
    } else {
      const to = thread.contact?.email ?? thread.externalKey;
      if (!to) throw new BadRequestException('Esta conversa não tem um e-mail de destino');
      const lastSent = await this.prisma.message.findFirst({ where: { tenantId, threadId: thread.id, direction: 'OUTBOUND', fromAddress: { not: null } }, orderBy: { createdAt: 'desc' }, select: { fromAddress: true } });
      const mailboxes = await this.prisma.emailMailbox.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: 'asc' } });
      const mailbox = mailboxes.find((candidate) => candidate.fromAddress === lastSent?.fromAddress) ?? mailboxes[0];
      if (!mailbox) throw new BadRequestException('Configure uma caixa de e-mail antes de responder');
      const subject = dto.subject?.trim() || (thread.subject ? (/^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`) : 'Re: sua mensagem');
      await this.email.send(tenantId, { mailboxId: mailbox.id, to, subject, text: dto.text });
    }
    return { ok: true };
  }
}
