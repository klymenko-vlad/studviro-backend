import { Injectable } from '@nestjs/common';

import { DependencyUnavailableError } from '../../common/errors/domain.error';
import type { SourceWriteIntent } from '../../database/schema';

import { LearningProvisioningRepository } from './learning-provisioning.repository';
import type { IntentWriter, WriteAcknowledgement } from './write-intent.types';
import { WriteTargetService } from './write-target.service';

export const COURSE_OFFERINGS_TABLE = 'course_offerings';
export const LEARNING_ENROLLMENTS_TABLE = 'enrollments';

export interface LearningSpacePayload extends Record<string, unknown> {
  readonly courseOfferingExternalId: string;
  readonly code: string;
  readonly name: string;
}

export interface LearningEnrollmentPayload extends Record<string, unknown> {
  readonly courseExternalId: string;
  readonly personExternalId: string;
}

@Injectable()
export class LearningSpaceProvisionWriter implements IntentWriter {
  readonly kind = 'learning_space.provision' as const;

  constructor(private readonly targets: WriteTargetService) {}

  async execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement> {
    const connector = await this.targets.learningWriter(
      intent.institutionId,
      intent.connectorName,
      'course.provision',
    );
    const payload = intent.payload as unknown as LearningSpacePayload;

    if (!connector.provisionCourse) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_COMMAND_UNSUPPORTED',
        `The "${intent.connectorName}" connector declares course provisioning but implements none`,
      );
    }

    return connector.provisionCourse({
      idempotencyKey: intent.id,
      courseOfferingExternalId: payload.courseOfferingExternalId,
      code: payload.code,
      name: payload.name,
    });
  }

  /**
   * Nothing is stamped on the offering: the learning space is a row of its own
   * and the next LMS import is what creates it, matching on the identifier the
   * intent recorded.
   */
  acknowledge(): Promise<void> {
    return Promise.resolve();
  }

  /** A refused provisioning reverses nothing — there was nothing here to undo. */
  compensate(): Promise<void> {
    return Promise.resolve();
  }

  abandon(): Promise<void> {
    return Promise.resolve();
  }
}

@Injectable()
export class LearningEnrollmentWriter implements IntentWriter {
  readonly kind = 'learning_enrollment.upsert' as const;

  constructor(
    private readonly targets: WriteTargetService,
    private readonly enrollments: LearningProvisioningRepository,
  ) {}

  async execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement> {
    const connector = await this.targets.learningWriter(
      intent.institutionId,
      intent.connectorName,
      'enrollment.write',
    );
    const payload = intent.payload as unknown as LearningEnrollmentPayload;

    if (!connector.upsertEnrollment) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_COMMAND_UNSUPPORTED',
        `The "${intent.connectorName}" connector declares enrolment writes but implements none`,
      );
    }

    return connector.upsertEnrollment({
      idempotencyKey: intent.id,
      courseExternalId: payload.courseExternalId,
      personExternalId: payload.personExternalId,
      role: 'student',
      active: true,
    });
  }

  /** `lms_provisioned_at` stops being a column nobody writes. */
  acknowledge(intent: SourceWriteIntent): Promise<void> {
    return this.enrollments.markProvisioned(intent.canonicalId, new Date());
  }

  compensate(intent: SourceWriteIntent): Promise<void> {
    return this.enrollments.recordProvisioningError(
      intent.canonicalId,
      intent.lastErrorMessage ?? 'The learning system refused the enrolment',
    );
  }

  abandon(intent: SourceWriteIntent): Promise<void> {
    return this.enrollments.recordProvisioningError(
      intent.canonicalId,
      intent.lastErrorMessage ?? 'The learning system could not be reached',
    );
  }
}
