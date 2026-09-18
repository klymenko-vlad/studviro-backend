import { Injectable } from '@nestjs/common';

import { DependencyUnavailableError } from '../../common/errors/domain.error';
import type { SourceWriteIntent } from '../../database/schema';

import { CourseResultWriteRepository } from './course-result-write.repository';
import type { IntentWriter, WriteAcknowledgement } from './write-intent.types';
import { WriteTargetService } from './write-target.service';

export const COURSE_RESULTS_TABLE = 'official_course_results';

export interface CourseResultPayload extends Record<string, unknown> {
  readonly enrollmentExternalId: string;
  readonly personExternalId: string;
  readonly attempt: number;
  readonly grade: string;
}

@Injectable()
export class CourseResultPublishWriter implements IntentWriter {
  readonly kind = 'course_result.publish' as const;

  constructor(
    private readonly targets: WriteTargetService,
    private readonly results: CourseResultWriteRepository,
  ) {}

  async execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement> {
    const target = await this.targets.academic(intent.institutionId, 'officialResult.write');

    if (target?.connectorName !== intent.connectorName) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_CONNECTOR_UNAVAILABLE',
        `The "${intent.connectorName}" connector no longer accepts result publication`,
      );
    }

    const payload = intent.payload as unknown as CourseResultPayload;

    if (!target.connector.publishResult) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_COMMAND_UNSUPPORTED',
        `The "${intent.connectorName}" connector declares result publication but implements none`,
      );
    }

    return target.connector.publishResult({
      idempotencyKey: intent.id,
      enrollmentExternalId: payload.enrollmentExternalId,
      personExternalId: payload.personExternalId,
      // The registrar has to be told which sitting the grade belongs to, or a
      // resit overwrites the failure it followed on their side instead of ours.
      attempt: payload.attempt,
      grade: payload.grade,
    });
  }

  acknowledge(intent: SourceWriteIntent, ack: WriteAcknowledgement): Promise<void> {
    return this.results.stampAcknowledged(intent.canonicalId, ack.externalId, new Date());
  }

  compensate(intent: SourceWriteIntent): Promise<void> {
    return this.results.returnToProposed(
      intent.canonicalId,
      intent.lastErrorMessage ?? 'The registrar would not record this grade',
    );
  }

  abandon(intent: SourceWriteIntent): Promise<void> {
    return this.results.markFailed(intent.canonicalId);
  }
}
