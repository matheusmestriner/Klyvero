import { Injectable } from '@nestjs/common';
import { Prisma, SequenceStep } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * The database is the schedule. A queued SequenceStepRun with a due scheduledAt is all the
 * scheduler needs, so nothing is lost when a cache is flushed or the process restarts.
 */
@Injectable()
export class SequencePlanner {
  constructor(private readonly prisma: PrismaService) {}

  nextStep(campaignId: string, afterPosition: number, db: Db = this.prisma) {
    return db.sequenceStep.findFirst({
      where: { campaignId, active: true, position: { gt: afterPosition } },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Queues `step` for the enrollment. With `keepQueued`, a run that is already waiting keeps its
   * time (used when resuming a paused campaign) instead of being pushed back by the step delay.
   */
  async schedule(db: Db, enrollmentId: string, step: SequenceStep, at: Date, keepQueued = false) {
    let when = at;
    const existing = keepQueued
      ? await db.sequenceStepRun.findUnique({ where: { enrollmentId_stepId: { enrollmentId, stepId: step.id } } })
      : null;
    if (existing?.status === 'QUEUED') {
      when = existing.scheduledAt;
    } else {
      await db.sequenceStepRun.upsert({
        where: { enrollmentId_stepId: { enrollmentId, stepId: step.id } },
        create: { enrollmentId, stepId: step.id, scheduledAt: at },
        update: { scheduledAt: at, status: 'QUEUED', attempts: 0, error: null, startedAt: null, finishedAt: null, messageId: null },
      });
    }
    return when;
  }
}
