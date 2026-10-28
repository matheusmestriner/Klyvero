import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { RedisService } from '../../infra/redis/redis.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QueueService } from '../../infra/queue/queue.service';
import { EmailService } from '../email/email.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class SequenceWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private readonly logger = new Logger(SequenceWorker.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if ((this.config.get<string>('RUN_QUEUE_WORKERS') ?? 'true') !== 'true') return;
    this.worker = new Worker('sequence', (job) => this.process(job), {
      connection: this.redis.client,
      prefix: this.config.get<string>('QUEUE_PREFIX') ?? 'klyvero',
      concurrency: 8,
    });
    this.worker.on('failed', async (job, error) => {
      if (!job || job.attemptsMade < 3) return;
      const { enrollmentId, stepId } = job.data as { enrollmentId: string; stepId: string };
      await this.prisma.sequenceStepRun.updateMany({ where: { enrollmentId, stepId }, data: { status: 'FAILED', error: error.message, finishedAt: new Date() } }).catch(() => undefined);
      await this.prisma.sequenceEnrollment.updateMany({ where: { id: enrollmentId }, data: { status: 'FAILED', lastError: error.message, nextRunAt: null } }).catch(() => undefined);
    });
  }

  private render(template: string, lead: any) {
    const values: Record<string, string> = {
      firstName: lead.firstName ?? '', lastName: lead.lastName ?? '', companyName: lead.companyName ?? '',
      jobTitle: lead.jobTitle ?? '', email: lead.email ?? '', phone: lead.phone ?? '', website: lead.website ?? '',
    };
    return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_m, key) => values[key] ?? '');
  }

  private async process(job: Job) {
    const { enrollmentId, stepId } = job.data as { enrollmentId: string; stepId: string };
    const enrollment = await this.prisma.sequenceEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { lead: true, campaign: { include: { steps: { where: { active: true }, orderBy: { position: 'asc' } } } } },
    });
    if (!enrollment || enrollment.status !== 'ACTIVE' || enrollment.campaign.status !== 'ACTIVE') return;
    const step = enrollment.campaign.steps.find((s) => s.id === stepId);
    if (!step) return;
    await this.prisma.sequenceStepRun.updateMany({ where: { enrollmentId, stepId }, data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } } });

    if (step.channel === 'EMAIL') {
      if (!enrollment.lead.email) throw new Error('Lead does not have an email address');
      if (!enrollment.campaign.emailMailboxId) throw new Error('Campaign does not have an email mailbox');
      await this.email.send(enrollment.tenantId, {
        mailboxId: enrollment.campaign.emailMailboxId,
        to: enrollment.lead.email,
        subject: this.render(step.subject ?? enrollment.campaign.name, enrollment.lead),
        text: this.render(step.body, enrollment.lead),
        leadId: enrollment.lead.id,
      });
    } else {
      if (!enrollment.lead.phone) throw new Error('Lead does not have a phone number');
      const connection = await this.prisma.whatsappConnection.findFirst({ where: { tenantId: enrollment.tenantId, loggedIn: true }, orderBy: { updatedAt: 'desc' } });
      if (!connection) throw new Error('No logged-in WhatsApp session');
      await this.whatsapp.sendText(enrollment.tenantId, { sessionId: connection.sessionId, to: enrollment.lead.phone, text: this.render(step.body, enrollment.lead) });
    }

    await this.prisma.sequenceStepRun.updateMany({ where: { enrollmentId, stepId }, data: { status: 'SENT', finishedAt: new Date() } });
    const next = enrollment.campaign.steps.find((candidate) => candidate.position > step.position);
    if (!next) {
      await this.prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: 'COMPLETED', currentPosition: step.position, completedAt: new Date(), nextRunAt: null } });
      return;
    }
    const nextAt = new Date(Date.now() + next.delayMinutes * 60_000);
    await this.prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { currentPosition: step.position, nextRunAt: nextAt } });
    await this.prisma.sequenceStepRun.upsert({ where: { enrollmentId_stepId: { enrollmentId, stepId: next.id } }, create: { enrollmentId, stepId: next.id, scheduledAt: nextAt }, update: { scheduledAt: nextAt, status: 'QUEUED', error: null } });
    await this.queues.get('sequence').add('run-step', { enrollmentId, stepId: next.id }, { delay: Math.max(0, nextAt.getTime() - Date.now()), attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, jobId: `${enrollmentId}-${next.id}`, removeOnComplete: 500, removeOnFail: 1000 });
  }

  async onModuleDestroy() { await this.worker?.close(); }
}
