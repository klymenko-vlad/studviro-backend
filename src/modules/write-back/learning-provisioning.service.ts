import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { QueueProducer } from '../../queue/queue.producer';

import { LearningProvisioningRepository } from './learning-provisioning.repository';
import {
  COURSE_OFFERINGS_TABLE,
  LEARNING_ENROLLMENTS_TABLE,
  type LearningEnrollmentPayload,
  type LearningSpacePayload,
} from './learning.writer';
import { WriteIntentService } from './write-intent.service';
import type { EnqueueOutcome } from './write-intent.types';
import { WriteTargetService } from './write-target.service';

/**
 * A run's worth, not the whole backlog: a first run against a fresh institution
 * would otherwise queue thousands of writes at once, and the next run picks up
 * whatever is left.
 */
const PER_RUN_LIMIT = 200;

export interface ProvisioningEnqueued {
  readonly spaces: number;
  readonly enrollments: number;
}

/**
 * Unlike the exam and enrolment pairs there is no user act to hang a
 * provisioning intent on, so the learning synchronization run is what
 * originates one: a run is exactly when the platform reconciles with the LMS,
 * and the outbox's one-queued-intent-per-row index makes a repeat harmless.
 */
@Injectable()
export class LearningProvisioningService {
  constructor(
    private readonly repository: LearningProvisioningRepository,
    private readonly intents: WriteIntentService,
    private readonly targets: WriteTargetService,
    private readonly queue: QueueProducer,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LearningProvisioningService.name);
  }

  async enqueuePending(institutionId: string): Promise<ProvisioningEnqueued> {
    const spaces = await this.enqueueSpaces(institutionId);
    const enrollments = await this.enqueueEnrollments(institutionId);

    if (spaces + enrollments > 0) {
      this.logger.info({ institutionId, spaces, enrollments }, 'provisioning writes queued');
    }

    return { spaces, enrollments };
  }

  private async enqueueSpaces(institutionId: string): Promise<number> {
    const target = await this.targets.learning(institutionId, 'course.provision');
    if (!target) return 0;

    const pending = await this.repository.findOfferingsNeedingSpace(
      institutionId,
      PER_RUN_LIMIT,
    );

    const outcomes = await Promise.all(
      pending.map(async (offering) => {
        const payload: LearningSpacePayload = {
          courseOfferingExternalId: offering.externalId,
          code: offering.code,
          name: offering.title,
        };

        return this.intents.enqueue({
          institutionId,
          targetSourceSystem: 'lms',
          connectorName: target.connectorName,
          kind: 'learning_space.provision',
          canonicalTable: COURSE_OFFERINGS_TABLE,
          canonicalId: offering.offeringId,
          payload: { ...payload },
          actorId: null,
        });
      }),
    );

    return this.publishAll(institutionId, outcomes);
  }

  private async enqueueEnrollments(institutionId: string): Promise<number> {
    const target = await this.targets.learning(institutionId, 'enrollment.write');
    if (!target) return 0;

    const pending = await this.repository.findEnrollmentsNeedingProvisioning(
      institutionId,
      target.connectorName,
      PER_RUN_LIMIT,
    );

    const outcomes = await Promise.all(
      pending.map(async (enrollment) => {
        const payload: LearningEnrollmentPayload = {
          courseExternalId: enrollment.courseExternalId,
          personExternalId: enrollment.personExternalId,
        };

        return this.intents.enqueue({
          institutionId,
          targetSourceSystem: 'lms',
          connectorName: target.connectorName,
          kind: 'learning_enrollment.upsert',
          canonicalTable: LEARNING_ENROLLMENTS_TABLE,
          canonicalId: enrollment.enrollmentId,
          payload: { ...payload },
          actorId: null,
        });
      }),
    );

    return this.publishAll(institutionId, outcomes);
  }

  private async publishAll(
    institutionId: string,
    outcomes: readonly EnqueueOutcome[],
  ): Promise<number> {
    const queued = outcomes.filter((outcome) => outcome.kind === 'queued');

    await Promise.all(
      queued.map((outcome) =>
        this.queue.enqueueSynchronization('writeBack', {
          institutionId,
          intentId: outcome.intentId,
        }),
      ),
    );

    return queued.length;
  }
}
