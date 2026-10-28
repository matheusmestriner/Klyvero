import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CalendarIntegrationService } from '../calendar-integration/calendar-integration.service';
import { AgentDto, CompanyDto, ContactDto, EventDto, EventsQueryDto, IntegrationDto, LeadDto, UpdateEventDto } from './dto';

@Injectable()
export class CrudService {
  constructor(private readonly prisma: PrismaService, private readonly googleCalendar: CalendarIntegrationService) {}

  leads(tenantId: string) {
    return this.prisma.lead.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  createLead(tenantId: string, dto: LeadDto) {
    return this.prisma.lead.create({
      data: {
        tenantId,
        ...dto,
        email: dto.email?.trim().toLowerCase(),
      },
    });
  }

  /** Returns the updated lead (the previous response was Prisma's {count}). */
  async updateLead(tenantId: string, id: string, dto: LeadDto) {
    if (!this.isUuid(id)) throw new NotFoundException('Lead not found');
    const result = await this.prisma.lead.updateMany({
      where: { id, tenantId },
      data: { ...dto, email: dto.email?.trim().toLowerCase() },
    });
    if (!result.count) throw new NotFoundException('Lead not found');
    return this.prisma.lead.findFirstOrThrow({ where: { id, tenantId } });
  }

  /** One lead with its recent history and the campaigns it is in. */
  async lead(tenantId: string, id: string) {
    const lead = this.isUuid(id) ? await this.prisma.lead.findFirst({ where: { id, tenantId } }) : null;
    if (!lead) throw new NotFoundException('Lead not found');
    const [activities, enrollments] = await Promise.all([
      this.prisma.leadActivity.findMany({ where: { tenantId, leadId: lead.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.sequenceEnrollment.findMany({
        where: { tenantId, leadId: lead.id },
        select: { id: true, status: true, currentPosition: true, nextRunAt: true, repliedAt: true, campaign: { select: { id: true, name: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { ...lead, activities, enrollments };
  }

  async addLeadNote(tenantId: string, id: string, body: string, actorUserId: string) {
    const lead = this.isUuid(id) ? await this.prisma.lead.findFirst({ where: { id, tenantId }, select: { id: true } }) : null;
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.leadActivity.create({ data: { tenantId, leadId: lead.id, actorUserId, type: 'note', title: 'Nota', body } });
  }

  deleteLead(tenantId: string, id: string) {
    return this.prisma.lead.deleteMany({ where: { id, tenantId } });
  }

  companies(tenantId: string) {
    return this.prisma.company.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, take: 500 });
  }

  createCompany(tenantId: string, dto: CompanyDto) {
    return this.prisma.company.create({ data: { tenantId, ...dto } });
  }

  deleteCompany(tenantId: string, id: string) {
    return this.prisma.company.deleteMany({ where: { id, tenantId } });
  }

  contacts(tenantId: string) {
    return this.prisma.contact.findMany({
      where: { tenantId },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async createContact(tenantId: string, dto: ContactDto) {
    if (dto.companyId) {
      const company = await this.prisma.company.findFirst({
        where: { id: dto.companyId, tenantId },
        select: { id: true },
      });
      if (!company) throw new BadRequestException('Company does not belong to this tenant');
    }
    return this.prisma.contact.create({
      data: {
        tenantId,
        ...dto,
        email: dto.email?.trim().toLowerCase(),
      },
    });
  }

  deleteContact(tenantId: string, id: string) {
    return this.prisma.contact.deleteMany({ where: { id, tenantId } });
  }

  agents(tenantId: string) {
    return this.prisma.aiAgent.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  createAgent(tenantId: string, dto: AgentDto) {
    return this.prisma.aiAgent.create({ data: { tenantId, ...dto } });
  }

  toggleAgent(tenantId: string, id: string, active: boolean) {
    return this.prisma.aiAgent.updateMany({ where: { id, tenantId }, data: { active } });
  }

  events(tenantId: string, query: EventsQueryDto = {}) {
    return this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        ...(query.from ? { endsAt: { gte: new Date(query.from) } } : {}),
        ...(query.to ? { startsAt: { lte: new Date(query.to) } } : {}),
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async createEvent(tenantId: string, dto: EventDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Event end must be after start');
    const event = await this.prisma.calendarEvent.create({ data: { tenantId, ...dto, startsAt, endsAt } });
    return this.googleCalendar.trySyncEvent(tenantId, event);
  }

  async updateEvent(tenantId: string, id: string, dto: UpdateEventDto) {
    const current = this.isUuid(id) ? await this.prisma.calendarEvent.findFirst({ where: { id, tenantId } }) : null;
    if (!current) throw new NotFoundException('Calendar event not found');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    if (endsAt <= startsAt) throw new BadRequestException('Event end must be after start');
    const event = await this.prisma.calendarEvent.update({ where: { id: current.id }, data: { ...dto, startsAt, endsAt } });
    return this.googleCalendar.trySyncEvent(tenantId, event);
  }

  async deleteEvent(tenantId: string, id: string) {
    const current = this.isUuid(id) ? await this.prisma.calendarEvent.findFirst({ where: { id, tenantId }, select: { externalId: true } }) : null;
    const result = await this.prisma.calendarEvent.deleteMany({ where: { id, tenantId } });
    if (result.count) await this.googleCalendar.tryDeleteRemote(tenantId, current?.externalId);
    return result;
  }

  private isUuid(value: string) {
    return isUUID(value);
  }

  /** Deletes one stored message; the conversation goes away with its last message. */
  async deleteInboxMessage(tenantId: string, id: string) {
    const message = this.isUuid(id) ? await this.prisma.message.findFirst({ where: { id, tenantId }, select: { id: true, threadId: true } }) : null;
    if (!message) throw new NotFoundException('Message not found');
    await this.prisma.message.delete({ where: { id: message.id } });
    const remaining = await this.prisma.message.count({ where: { threadId: message.threadId } });
    if (!remaining) await this.prisma.messageThread.deleteMany({ where: { id: message.threadId, tenantId } });
    return { deleted: true, threadRemoved: !remaining };
  }

  async deleteInboxThread(tenantId: string, id: string) {
    const result = this.isUuid(id) ? await this.prisma.messageThread.deleteMany({ where: { id, tenantId } }) : { count: 0 };
    if (!result.count) throw new NotFoundException('Conversation not found');
    return { deleted: true };
  }

  integrations(tenantId: string) {
    return this.prisma.integration.findMany({
      where: { tenantId },
      select: { id: true, type: true, name: true, status: true, config: true, createdAt: true, updatedAt: true },
    });
  }

  async integration(tenantId: string, dto: IntegrationDto) {
    const secretKey = (value: unknown, path = 'config'): string | null => {
      if (!value || typeof value !== 'object') return null;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const childPath = `${path}.${key}`;
        if (/(password|passwd|secret|token|api[_-]?key|private[_-]?key)/i.test(key)) return childPath;
        const nested = secretKey(child, childPath);
        if (nested) return nested;
      }
      return null;
    };
    const sensitive = secretKey(dto.config);
    if (sensitive) throw new BadRequestException(`Sensitive credential cannot be stored in plaintext at ${sensitive}`);
    return this.prisma.integration.create({ data: { tenantId, ...dto } });
  }

  threads(tenantId: string) {
    return this.prisma.messageThread.findMany({
      where: { tenantId },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: 'asc' }, take: 100 },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
  }

  audits(tenantId: string) {
    return this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
