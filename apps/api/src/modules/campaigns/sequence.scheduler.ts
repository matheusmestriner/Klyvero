import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Lead, Prisma, SequenceStep } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toWhatsappNumber } from '../../common/phone';
import { EmailService } from '../email/email.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { renderTemplate, retryDelayMs } from './campaign-template';
import { SequencePlanner } from './sequence.planner';

/** Nothing to send to this lead on this step; record it and move on to the next one. */
class StepSkip extends Error {}
/** Not the lead's fault (quota, pacing, no WhatsApp session): try again later without using an attempt. */
class StepDefer extends Error {
  constructor(message: string, readonly delayMs: number) { super(message); }
}
/** Retrying cannot help (missing mailbox, unknown session). */
class StepPermanent extends Error {}

type Claimed = Prisma.SequenceStepRunGetPayload<{
  include: { step: true; enrollment: { include: { lead: true; campaign: true } } };
}>;

@Injectable()
export class SequenceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SequenceScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: SequencePlanner,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  private num(key: string, fallback: number) {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value >= 0 && this.config.get(key) !== undefined && this.config.get(key) !== '' ? value : fallback;
  }

  onModuleInit() {
    if (this.config.get('RUN_SEQUENCE_SCHEDULER') === 'false') return;
    const everyMs = Math.max(1, this.num('SEQUENCE_TICK_SECONDS', 15)) * 1000;
    this.timer = setInterval(() => void this.tick(), everyMs);
    this.timer.unref();
    // Catch up right after boot: a free-tier instance that slept leaves overdue steps behind.
    setTimeout(() => void this.tick(), 2_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One scheduler pass. Never overlaps itself in this process; other instances are kept apart by SKIP LOCKED. */
  async tick() {
    if (this.running) return 0;
    this.running = true;
    try {
      await this.recoverStuck();
      return await this.runDue();
    } catch (error) {
      this.logger.error(`Scheduler pass failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** Steps claimed by a process that died mid-send go back to the queue. */
  private async recoverStuck() {
    const cutoff = new Date(Date.now() - 10 * 60_000);
    await this.prisma.sequenceStepRun.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: cutoff } },
      data: { status: 'QUEUED', startedAt: null },
    });
  }

  async runDue(maxPerPass = this.num('SEQUENCE_MAX_PER_TICK', 50)) {
    let processed = 0;
    while (processed < maxPerPass) {
      const ids = await this.claim(Math.min(10, maxPerPass - processed));
      if (!ids.length) break;
      for (const id of ids) {
        await this.execute(id);
        processed += 1;
      }
    }
    return processed;
  }

  /** Atomically takes due steps of active enrollments in active campaigns. */
  private async claim(limit: number) {
    const now = new Date();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "SequenceStepRun" r
         SET status = 'RUNNING', "startedAt" = ${now}, attempts = r.attempts + 1
       WHERE r.id IN (
         SELECT q.id
           FROM "SequenceStepRun" q
           JOIN "SequenceEnrollment" e ON e.id = q."enrollmentId"
           JOIN "Campaign" c ON c.id = e."campaignId"
          WHERE q.status = 'QUEUED'
            AND q."scheduledAt" <= ${now}
            AND e.status = 'ACTIVE'
            AND c.status = 'ACTIVE'
          ORDER BY q."scheduledAt" ASC
          LIMIT ${limit}
            FOR UPDATE OF q SKIP LOCKED)
      RETURNING r.id`;
    return rows.map((row) => row.id);
  }

  private async execute(runId: string) {
    const run = await this.prisma.sequenceStepRun.findUnique({
      where: { id: runId },
      include: { step: true, enrollment: { include: { lead: true, campaign: true } } },
    });
    if (!run || run.status !== 'RUNNING') return;

    try {
      // The lead may have replied, or the campaign been paused, between the claim and now.
      const fresh = await this.prisma.sequenceEnrollment.findUnique({
        where: { id: run.enrollmentId },
        select: { status: true, campaign: { select: { status: true } } },
      });
      if (!fresh || fresh.status !== 'ACTIVE' || fresh.campaign.status !== 'ACTIVE') {
        const resumable = fresh && (fresh.status === 'PAUSED' || (fresh.status === 'ACTIVE' && fresh.campaign.status === 'PAUSED'));
        await this.prisma.sequenceStepRun.update({
          where: { id: run.id },
          data: resumable
            ? { status: 'QUEUED', startedAt: null, attempts: { decrement: 1 } }
            : { status: 'CANCELED', finishedAt: new Date() },
        });
        return;
      }

      let messageId: string | undefined;
      try {
        messageId = await this.deliver(run);
      } catch (error) {
        if (error instanceof StepSkip) {
          await this.prisma.sequenceStepRun.update({ where: { id: run.id }, data: { status: 'SKIPPED', finishedAt: new Date(), error: error.message } });
          await this.advance(run);
        } else {
          await this.handleFailure(run, error);
        }
        return;
      }

      // Delivered. From here on a failure must never turn into a retry (it would send twice),
      // so bookkeeping is retried on its own and, if it still fails, only logged.
      await this.recordSent(run, messageId).catch(() => this.recordSent(run, messageId));
      await this.advance(run);
    } catch (error) {
      // Bookkeeping itself failed (database trouble). The stuck-run recovery will requeue it.
      this.logger.error(`Step run ${runId} could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async recordSent(run: Claimed, messageId: string | undefined) {
    await this.prisma.$transaction(async (tx) => {
      await tx.sequenceStepRun.update({ where: { id: run.id }, data: { status: 'SENT', finishedAt: new Date(), messageId, error: null } });
      await tx.lead.updateMany({ where: { id: run.enrollment.leadId, status: 'NEW' }, data: { status: 'CONTACTED' } });
      await tx.leadActivity.create({
        data: {
          tenantId: run.enrollment.tenantId,
          leadId: run.enrollment.leadId,
          type: `campaign.${run.step.channel.toLowerCase()}.sent`,
          title: `Passo ${run.step.position} enviado (${run.enrollment.campaign.name})`,
          metadata: { campaignId: run.enrollment.campaignId, stepId: run.stepId, messageId: messageId ?? null },
        },
      });
    });
  }

  private async deliver(run: Claimed): Promise<string | undefined> {
    const { step, enrollment } = run;
    const { lead, campaign } = enrollment;
    return step.channel === 'EMAIL' ? this.deliverEmail(step, lead, campaign.emailMailboxId, enrollment.tenantId, campaign.name)
      : this.deliverWhatsapp(step, lead, enrollment.tenantId);
  }

  private async deliverEmail(step: SequenceStep, lead: Lead, mailboxId: string | null, tenantId: string, campaignName: string) {
    if (!lead.email) throw new StepSkip('Lead sem e-mail');
    if (!mailboxId) throw new StepPermanent('Campanha sem caixa de e-mail');
    if (await this.email.isSuppressed(tenantId, lead.email)) throw new StepSkip('Destinatário descadastrado');
    const result = await this.email.send(tenantId, {
      mailboxId,
      to: lead.email,
      subject: renderTemplate(step.subject ?? campaignName, lead),
      text: renderTemplate(step.body, lead),
      leadId: lead.id,
      includeUnsubscribeFooter: true,
    });
    return result.messageId;
  }

  private async deliverWhatsapp(step: SequenceStep, lead: Lead, tenantId: string) {
    if (!lead.phone) throw new StepSkip('Lead sem telefone');
    const to = toWhatsappNumber(lead.phone);
    if (to.length < 8) throw new StepSkip('Telefone inválido');

    const connection = await this.prisma.whatsappConnection.findFirst({
      where: { tenantId, loggedIn: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!connection) throw new StepDefer('Nenhuma sessão de WhatsApp conectada', 5 * 60_000);

    // Space out sends per workspace: bursts are what get WhatsApp numbers banned.
    const gapMs = this.num('WHATSAPP_MIN_INTERVAL_SECONDS', 20) * 1000;
    if (gapMs > 0) {
      const last = await this.prisma.sequenceStepRun.findFirst({
        where: { status: 'SENT', step: { channel: 'WHATSAPP' }, enrollment: { tenantId } },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      });
      const wait = last?.finishedAt ? last.finishedAt.getTime() + gapMs - Date.now() : 0;
      if (wait > 0) throw new StepDefer('Aguardando intervalo entre envios de WhatsApp', wait + Math.floor(Math.random() * 10_000));
    }

    await this.whatsapp.sendText(tenantId, { sessionId: connection.sessionId, to, text: renderTemplate(step.body, lead) });
    return undefined;
  }

  /** Moves the enrollment to the next step, or completes it. A reply that arrived meanwhile wins. */
  private async advance(run: Claimed) {
    const { enrollment, step } = run;
    const next = await this.planner.nextStep(enrollment.campaignId, step.position);
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.SequenceEnrollmentUpdateManyMutationInput = { currentPosition: step.position };
      if (!next) Object.assign(data, { status: 'COMPLETED', completedAt: new Date(), nextRunAt: null });
      const moved = await tx.sequenceEnrollment.updateMany({
        where: { id: enrollment.id, status: { in: ['ACTIVE', 'PAUSED'] } },
        data,
      });
      if (!moved.count || !next) return;
      const at = new Date(Date.now() + next.delayMinutes * 60_000);
      await this.planner.schedule(tx, enrollment.id, next, at);
      await tx.sequenceEnrollment.updateMany({ where: { id: enrollment.id, status: 'ACTIVE' }, data: { nextRunAt: at } });
    });
  }

  private async handleFailure(run: Claimed, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const maxAttempts = this.num('SEQUENCE_MAX_ATTEMPTS', 3);

    if (error instanceof StepDefer || error instanceof ForbiddenException) {
      // Quota or subscription problems clear up on their own; wait an hour instead of failing the lead.
      const delay = error instanceof StepDefer ? error.delayMs : 60 * 60_000;
      const at = new Date(Date.now() + delay);
      await this.prisma.sequenceStepRun.update({
        where: { id: run.id },
        data: { status: 'QUEUED', scheduledAt: at, startedAt: null, attempts: { decrement: 1 }, error: message },
      });
      await this.prisma.sequenceEnrollment.updateMany({ where: { id: run.enrollmentId, status: 'ACTIVE' }, data: { nextRunAt: at, lastError: message } });
      return;
    }

    const permanent = error instanceof StepPermanent || error instanceof NotFoundException || error instanceof BadRequestException;
    if (!permanent && run.attempts < maxAttempts) {
      const at = new Date(Date.now() + retryDelayMs(run.attempts));
      await this.prisma.sequenceStepRun.update({ where: { id: run.id }, data: { status: 'QUEUED', scheduledAt: at, startedAt: null, error: message } });
      await this.prisma.sequenceEnrollment.updateMany({ where: { id: run.enrollmentId, status: 'ACTIVE' }, data: { nextRunAt: at, lastError: message } });
      return;
    }

    await this.prisma.$transaction([
      this.prisma.sequenceStepRun.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), error: message } }),
      this.prisma.sequenceEnrollment.updateMany({
        where: { id: run.enrollmentId, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: { status: 'FAILED', lastError: message, nextRunAt: null },
      }),
    ]);
  }
}
