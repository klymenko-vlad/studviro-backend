import { Injectable } from '@nestjs/common';

import type { OfficialCourseResult } from '../../database/schema';
import { QueueProducer } from '../../queue/queue.producer';

import { CourseResultWriteRepository } from './course-result-write.repository';
import { COURSE_RESULTS_TABLE, type CourseResultPayload } from './course-result.writer';
import { WriteIntentService } from './write-intent.service';
import type { EnqueueOutcome } from './write-intent.types';
import { WriteTargetService } from './write-target.service';

@Injectable()
export class CourseResultWriteBackService {
  constructor(
    private readonly intents: WriteIntentService,
    private readonly results: CourseResultWriteRepository,
    private readonly targets: WriteTargetService,
    private readonly queue: QueueProducer,
  ) {}

  async enqueuePublication(
    result: OfficialCourseResult,
    actorId: string,
  ): Promise<EnqueueOutcome> {
    const target = await this.targets.academic(result.institutionId, 'officialResult.write');
    if (!target) return { kind: 'not_writable' };

    const context = await this.results.findContext(
      result.institutionId,
      result.id,
      target.connectorName,
    );

    if (!context?.enrollmentExternalId || !context.personExternalId || !context.grade) {
      return { kind: 'not_writable' };
    }

    const payload: CourseResultPayload = {
      enrollmentExternalId: context.enrollmentExternalId,
      personExternalId: context.personExternalId,
      attempt: context.attempt,
      grade: context.grade,
    };

    return this.intents.enqueue({
      institutionId: result.institutionId,
      targetSourceSystem: 'sis',
      connectorName: target.connectorName,
      kind: 'course_result.publish',
      canonicalTable: COURSE_RESULTS_TABLE,
      canonicalId: result.id,
      payload: { ...payload },
      actorId,
    });
  }

  async publish(institutionId: string, outcome: EnqueueOutcome): Promise<void> {
    if (outcome.kind !== 'queued') return;

    await this.queue.enqueueSynchronization('writeBack', {
      institutionId,
      intentId: outcome.intentId,
    });
  }
}
