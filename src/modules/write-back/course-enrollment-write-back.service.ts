import { Injectable } from '@nestjs/common';

import type { Enrollment } from '../../database/schema';
import { QueueProducer } from '../../queue/queue.producer';

import { CourseEnrollmentWriteRepository } from './course-enrollment-write.repository';
import { ENROLLMENTS_TABLE, type CourseEnrollmentPayload } from './course-enrollment.writer';
import { WriteIntentService } from './write-intent.service';
import type { EnqueueOutcome } from './write-intent.types';
import { WriteTargetService } from './write-target.service';

@Injectable()
export class CourseEnrollmentWriteBackService {
  constructor(
    private readonly intents: WriteIntentService,
    private readonly enrollments: CourseEnrollmentWriteRepository,
    private readonly targets: WriteTargetService,
    private readonly queue: QueueProducer,
  ) {}

  enqueueRequest(enrollment: Enrollment, actorId: string): Promise<EnqueueOutcome> {
    return this.enqueue(enrollment, actorId, 'course_enrollment.request');
  }

  enqueueWithdrawal(enrollment: Enrollment, actorId: string): Promise<EnqueueOutcome> {
    return this.enqueue(enrollment, actorId, 'course_enrollment.withdraw');
  }

  async publish(institutionId: string, outcome: EnqueueOutcome): Promise<void> {
    if (outcome.kind !== 'queued') return;

    await this.queue.enqueueSynchronization('writeBack', {
      institutionId,
      intentId: outcome.intentId,
    });
  }

  private async enqueue(
    enrollment: Enrollment,
    actorId: string,
    kind: 'course_enrollment.request' | 'course_enrollment.withdraw',
  ): Promise<EnqueueOutcome> {
    const target = await this.targets.academic(
      enrollment.institutionId,
      'courseRegistration.write',
    );
    if (!target) return { kind: 'not_writable' };

    const context = await this.enrollments.findContext(
      enrollment.institutionId,
      enrollment.id,
      target.connectorName,
    );

    if (!context?.courseOfferingExternalId || !context.personExternalId) {
      return { kind: 'not_writable' };
    }

    const payload: CourseEnrollmentPayload = {
      courseOfferingExternalId: context.courseOfferingExternalId,
      personExternalId: context.personExternalId,
      enrollmentExternalId: context.enrollmentExternalId,
    };

    return this.intents.enqueue({
      institutionId: enrollment.institutionId,
      targetSourceSystem: 'sis',
      connectorName: target.connectorName,
      kind,
      canonicalTable: ENROLLMENTS_TABLE,
      canonicalId: enrollment.id,
      payload: { ...payload },
      actorId,
    });
  }
}
