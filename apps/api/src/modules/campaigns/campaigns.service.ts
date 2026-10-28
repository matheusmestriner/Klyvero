import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QueueService } from '../../infra/queue/queue.service';
import { CreateCampaignDto, EnrollDto, SequenceStepDto } from './dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService, private readonly queues: QueueService) {}

  list(tenantId: string) {
    return this.prisma.campaign.findMany({
      where: { tenantId },
      include: { steps: { orderBy: { position: 'asc' } }, _count: { select: { enrollments: true } }, emailMailbox: { select: { id: true, name: true, fromAddress: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateCampaignDto) {
    if ((dto.channel === 'EMAIL' || dto.channel === 'MULTICHANNEL') && dto.emailMailboxId) {
      const mailbox = await this.prisma.emailMailbox.findFirst({ where: { id: dto.emailMailboxId, tenantId } });
      if (!mailbox) throw new BadRequestException('Mailbox does not belong to tenant');
    }
    return this.prisma.campaign.create({ data: { tenantId, ...dto } });
  }

  async addStep(tenantId: string, campaignId: string, dto: SequenceStepDto) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return this.prisma.sequenceStep.upsert({
      where: { campaignId_position: { campaignId, position: dto.position } },
      create: { campaignId, ...dto },
      update: dto,
    });
  }

  async enroll(tenantId: string, campaignId: string, dto: EnrollDto) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, include: { steps: { where: { active: true }, orderBy: { position: 'asc' } } } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.steps.length) throw new BadRequestException('Campaign has no active steps');
    const leads = await this.prisma.lead.findMany({ where: { tenantId, id: { in: dto.leadIds } }, select: { id: true } });
    if (leads.length !== new Set(dto.leadIds).size) throw new BadRequestException('One or more leads do not belong to tenant');
    let created = 0;
    for (const lead of leads) {
      const enrollment = await this.prisma.sequenceEnrollment.upsert({
        where: { campaignId_leadId: { campaignId, leadId: lead.id } },
        create: { tenantId, campaignId, leadId: lead.id, status: campaign.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED' },
        update: {},
      });
      if (campaign.status === 'ACTIVE') await this.scheduleStep(enrollment.id, campaign.steps[0].id, campaign.steps[0].delayMinutes);
      created += 1;
    }
    return { enrolled: created };
  }

  private async scheduleStep(enrollmentId: string, stepId: string, delayMinutes: number) {
    const scheduledAt = new Date(Date.now() + delayMinutes * 60_000);
    await this.prisma.sequenceStepRun.upsert({
      where: { enrollmentId_stepId: { enrollmentId, stepId } },
      create: { enrollmentId, stepId, scheduledAt },
      update: { scheduledAt, status: 'QUEUED', error: null },
    });
    await this.prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { nextRunAt: scheduledAt, status: 'ACTIVE' } });
    await this.queues.get('sequence').add('run-step', { enrollmentId, stepId }, {
      delay: Math.max(0, scheduledAt.getTime() - Date.now()),
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
      jobId: `${enrollmentId}-${stepId}`,
    });
  }

  async start(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, include: { steps: { where: { active: true }, orderBy: { position: 'asc' } }, enrollments: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.steps.length) throw new BadRequestException('Campaign has no active steps');
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' } });
    for (const enrollment of campaign.enrollments.filter((e) => !['REPLIED', 'COMPLETED', 'STOPPED'].includes(e.status))) {
      const step = campaign.steps.find((s) => s.position > enrollment.currentPosition) ?? campaign.steps[0];
      await this.scheduleStep(enrollment.id, step.id, step.delayMinutes);
    }
    return { ok: true, scheduled: campaign.enrollments.length };
  }

  async pause(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
    await this.prisma.sequenceEnrollment.updateMany({ where: { campaignId, tenantId, status: 'ACTIVE' }, data: { status: 'PAUSED', nextRunAt: null } });
    return { ok: true };
  }

  enrollments(tenantId: string, campaignId: string) {
    return this.prisma.sequenceEnrollment.findMany({
      where: { tenantId, campaignId },
      include: { lead: true, runs: { include: { step: true }, orderBy: { scheduledAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
