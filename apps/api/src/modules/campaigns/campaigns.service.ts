import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateCampaignDto, EnrollDto, EnrollmentsQueryDto, SequenceStepDto, UpdateCampaignDto } from './dto';
import { SequencePlanner } from './sequence.planner';

const TERMINAL: EnrollmentStatus[] = ['REPLIED', 'COMPLETED', 'STOPPED'];

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService, private readonly planner: SequencePlanner) {}

  async list(tenantId: string) {
    const [rows, grouped, sent] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { tenantId },
        include: {
          steps: { orderBy: { position: 'asc' } },
          _count: { select: { enrollments: true } },
          emailMailbox: { select: { id: true, name: true, fromAddress: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sequenceEnrollment.groupBy({ by: ['campaignId', 'status'], where: { tenantId }, _count: { _all: true } }),
      this.prisma.$queryRaw<{ campaignId: string; total: bigint }[]>`
        SELECT e."campaignId", COUNT(*) AS total
          FROM "SequenceStepRun" r
          JOIN "SequenceEnrollment" e ON e.id = r."enrollmentId"
         WHERE e."tenantId" = ${tenantId}::uuid AND r.status = 'SENT'
         GROUP BY e."campaignId"`,
    ]);

    return rows.map((campaign) => {
      const stats = { active: 0, paused: 0, replied: 0, completed: 0, failed: 0, stopped: 0, sent: 0 };
      for (const group of grouped) {
        if (group.campaignId === campaign.id) stats[group.status.toLowerCase() as keyof typeof stats] = group._count._all;
      }
      stats.sent = Number(sent.find((row) => row.campaignId === campaign.id)?.total ?? 0);
      return { ...campaign, stats };
    });
  }

  private async mailbox(tenantId: string, mailboxId: string) {
    const mailbox = await this.prisma.emailMailbox.findFirst({ where: { id: mailboxId, tenantId } });
    if (!mailbox) throw new BadRequestException('Mailbox does not belong to tenant');
    if (!mailbox.active) throw new BadRequestException('Mailbox is inactive');
    return mailbox;
  }

  private async owned(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async create(tenantId: string, dto: CreateCampaignDto) {
    if (dto.emailMailboxId) await this.mailbox(tenantId, dto.emailMailboxId);
    return this.prisma.campaign.create({ data: { tenantId, ...dto } });
  }

  async update(tenantId: string, campaignId: string, dto: UpdateCampaignDto) {
    const campaign = await this.owned(tenantId, campaignId);
    if (dto.emailMailboxId) {
      if (campaign.status === 'ACTIVE') throw new BadRequestException('Pause the campaign before changing its mailbox');
      await this.mailbox(tenantId, dto.emailMailboxId);
    }
    return this.prisma.campaign.update({ where: { id: campaign.id }, data: dto });
  }

  async remove(tenantId: string, campaignId: string) {
    const campaign = await this.owned(tenantId, campaignId);
    if (campaign.status === 'ACTIVE') throw new BadRequestException('Pause the campaign before deleting it');
    await this.prisma.campaign.delete({ where: { id: campaign.id } });
    return { deleted: true };
  }

  async addStep(tenantId: string, campaignId: string, dto: SequenceStepDto) {
    const campaign = await this.owned(tenantId, campaignId);
    if (campaign.channel !== 'MULTICHANNEL' && campaign.channel !== dto.channel) {
      throw new BadRequestException(campaign.channel === 'EMAIL' ? 'This campaign only accepts e-mail steps' : 'This campaign only accepts WhatsApp steps');
    }
    return this.prisma.sequenceStep.upsert({
      where: { campaignId_position: { campaignId, position: dto.position } },
      create: { campaignId, ...dto },
      update: dto,
    });
  }

  async removeStep(tenantId: string, campaignId: string, stepId: string) {
    const campaign = await this.owned(tenantId, campaignId);
    if (campaign.status === 'ACTIVE') throw new BadRequestException('Pause the campaign before removing steps');
    const removed = await this.prisma.sequenceStep.deleteMany({ where: { id: stepId, campaignId } });
    if (!removed.count) throw new NotFoundException('Step not found');
    return { deleted: true };
  }

  async enroll(tenantId: string, campaignId: string, dto: EnrollDto) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: { steps: { where: { active: true }, orderBy: { position: 'asc' } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.steps.length) throw new BadRequestException('Campaign has no active steps');

    const ids = [...new Set(dto.leadIds)];
    const leads = await this.prisma.lead.findMany({ where: { tenantId, id: { in: ids } } });
    if (leads.length !== ids.length) throw new BadRequestException('One or more leads do not belong to tenant');

    // A lead is only worth enrolling if at least one of the channels used by the steps can reach it.
    const needsEmail = campaign.steps.some((step) => step.channel === 'EMAIL');
    const needsPhone = campaign.steps.some((step) => step.channel === 'WHATSAPP');
    const reachable = leads.filter((lead) => (needsEmail && !!lead.email) || (needsPhone && !!lead.phone));
    const existing = new Set((await this.prisma.sequenceEnrollment.findMany({ where: { campaignId, leadId: { in: ids } }, select: { leadId: true } })).map((row) => row.leadId));
    const fresh = reachable.filter((lead) => !existing.has(lead.id));

    const active = campaign.status === 'ACTIVE';
    const first = campaign.steps[0];
    await this.prisma.$transaction(async (tx) => {
      for (const lead of fresh) {
        const at = new Date(Date.now() + first.delayMinutes * 60_000);
        const enrollment = await tx.sequenceEnrollment.create({
          data: { tenantId, campaignId, leadId: lead.id, status: active ? 'ACTIVE' : 'PAUSED', nextRunAt: active ? at : null },
        });
        if (active) await this.planner.schedule(tx, enrollment.id, first, at);
      }
    }, { timeout: 60_000 });

    return {
      enrolled: fresh.length,
      alreadyEnrolled: reachable.length - fresh.length,
      withoutContact: leads.length - reachable.length,
    };
  }

  async start(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: { steps: { where: { active: true }, orderBy: { position: 'asc' } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.steps.length) throw new BadRequestException('Campaign has no active steps');

    const warnings: string[] = [];
    if (campaign.steps.some((step) => step.channel === 'EMAIL')) {
      if (!campaign.emailMailboxId) throw new BadRequestException('Choose the campaign mailbox before starting');
      await this.mailbox(tenantId, campaign.emailMailboxId);
    }
    if (campaign.steps.some((step) => step.channel === 'WHATSAPP')) {
      const session = await this.prisma.whatsappConnection.findFirst({ where: { tenantId, loggedIn: true }, select: { id: true } });
      if (!session) warnings.push('Nenhuma sessão de WhatsApp conectada: os passos de WhatsApp aguardam até você conectar.');
    }

    const enrollments = await this.prisma.sequenceEnrollment.findMany({
      where: { campaignId, tenantId, status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { id: true, currentPosition: true },
    });

    let completed = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' } });
      for (const enrollment of enrollments) {
        const next = campaign.steps.find((step) => step.position > enrollment.currentPosition);
        if (!next) {
          completed += 1;
          await tx.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: 'COMPLETED', completedAt: new Date(), nextRunAt: null } });
          continue;
        }
        const at = new Date(Date.now() + next.delayMinutes * 60_000);
        const when = await this.planner.schedule(tx, enrollment.id, next, at, true);
        await tx.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: 'ACTIVE', nextRunAt: when, lastError: null } });
      }
    }, { timeout: 60_000 });

    return { ok: true, scheduled: enrollments.length - completed, completed, warnings };
  }

  async pause(tenantId: string, campaignId: string) {
    await this.owned(tenantId, campaignId);
    await this.prisma.$transaction([
      this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } }),
      this.prisma.sequenceEnrollment.updateMany({ where: { campaignId, tenantId, status: 'ACTIVE' }, data: { status: 'PAUSED', nextRunAt: null } }),
    ]);
    return { ok: true };
  }

  async enrollments(tenantId: string, campaignId: string, query: EnrollmentsQueryDto) {
    await this.owned(tenantId, campaignId);
    return this.prisma.sequenceEnrollment.findMany({
      where: { tenantId, campaignId, ...(query.status ? { status: query.status } : {}) },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true, status: true } },
        runs: {
          select: { id: true, status: true, scheduledAt: true, finishedAt: true, attempts: true, error: true, step: { select: { id: true, position: true, channel: true } } },
          orderBy: { scheduledAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 200,
    });
  }

  async stopEnrollment(tenantId: string, campaignId: string, enrollmentId: string) {
    const enrollment = await this.prisma.sequenceEnrollment.findFirst({ where: { id: enrollmentId, campaignId, tenantId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (TERMINAL.includes(enrollment.status)) return enrollment;
    const [, stopped] = await this.prisma.$transaction([
      this.prisma.sequenceStepRun.updateMany({ where: { enrollmentId, status: 'QUEUED' }, data: { status: 'CANCELED', finishedAt: new Date() } }),
      this.prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { status: 'STOPPED', nextRunAt: null } }),
    ]);
    return stopped;
  }

  async retryEnrollment(tenantId: string, campaignId: string, enrollmentId: string) {
    const enrollment = await this.prisma.sequenceEnrollment.findFirst({ where: { id: enrollmentId, campaignId, tenantId }, include: { campaign: true } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.status !== 'FAILED') throw new BadRequestException('Only failed enrollments can be retried');

    const failed = await this.prisma.sequenceStepRun.findFirst({ where: { enrollmentId, status: 'FAILED' }, orderBy: { scheduledAt: 'desc' }, include: { step: true } });
    const step = failed?.step ?? (await this.planner.nextStep(campaignId, enrollment.currentPosition));
    if (!step) throw new BadRequestException('Nothing left to retry');

    const active = enrollment.campaign.status === 'ACTIVE';
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const at = new Date();
      await this.planner.schedule(tx, enrollmentId, step, at);
      return tx.sequenceEnrollment.update({
        where: { id: enrollmentId },
        data: { status: active ? 'ACTIVE' : 'PAUSED', nextRunAt: active ? at : null, lastError: null },
      });
    });
  }
}
