import { Injectable } from '@nestjs/common';

import type { ExamRegistration } from '../../database/schema';
import { QueueProducer } from '../../queue/queue.producer';

import { ExamRegistrationWriteRepository } from './exam-registration-write.repository';
import { EXAM_REGISTRATIONS_TABLE } from './exam-registration.writer';
import { WriteIntentService } from './write-intent.service';
import type { EnqueueOutcome, ExamRegistrationPayload } from './write-intent.types';
import { WriteTargetService } from './write-target.service';

@Injectable()
export class ExamRegistrationWriteBackService {
  constructor(
    private readonly intents: WriteIntentService,
    private readonly registrations: ExamRegistrationWriteRepository,
    private readonly targets: WriteTargetService,
    private readonly queue: QueueProducer,
  ) {}

  enqueueCreate(registration: ExamRegistration, actorId: string): Promise<EnqueueOutcome> {
    return this.enqueue(registration, actorId, 'exam_registration.create');
  }

  enqueueCancel(registration: ExamRegistration, actorId: string): Promise<EnqueueOutcome> {
    return this.enqueue(registration, actorId, 'exam_registration.cancel');
  }

  /**
   * Called after the enclosing transaction commits: the intent row is the
   * durable part, the job only wakes the worker sooner than the next retry.
   */
  async publish(institutionId: string, outcome: EnqueueOutcome): Promise<void> {
    if (outcome.kind !== 'queued') return;

    await this.queue.enqueueSynchronization('writeBack', {
      institutionId,
      intentId: outcome.intentId,
    });
  }

  private async enqueue(
    registration: ExamRegistration,
    actorId: string,
    kind: 'exam_registration.create' | 'exam_registration.cancel',
  ): Promise<EnqueueOutcome> {
    const target = await this.targets.academic(
      registration.institutionId,
      'examRegistration.write',
    );
    if (!target) return { kind: 'not_writable' };

    const context = await this.registrations.findContext(
      registration.institutionId,
      registration.id,
      target.connectorName,
    );

    if (!context?.examTermExternalId || !context.personExternalId) {
      return { kind: 'not_writable' };
    }

    const payload: ExamRegistrationPayload = {
      examTermExternalId: context.examTermExternalId,
      personExternalId: context.personExternalId,
      registrationExternalId: context.registrationExternalId,
    };

    const outcome = await this.intents.enqueue({
      institutionId: registration.institutionId,
      targetSourceSystem: 'sis',
      connectorName: target.connectorName,
      kind,
      canonicalTable: EXAM_REGISTRATIONS_TABLE,
      canonicalId: registration.id,
      payload: { ...payload },
      actorId,
    });

    if (outcome.kind === 'queued') {
      await this.registrations.markPending(registration.id);
    }

    return outcome;
  }
}
