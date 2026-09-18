import { Injectable } from '@nestjs/common';

import { DependencyUnavailableError } from '../../common/errors/domain.error';
import type { SourceWriteIntent } from '../../database/schema';
import { EnrollmentNotificationsService } from '../notifications/enrollment-notifications.service';

import { CourseEnrollmentWriteRepository } from './course-enrollment-write.repository';
import type { IntentWriter, WriteAcknowledgement } from './write-intent.types';
import { WriteTargetService } from './write-target.service';

export const ENROLLMENTS_TABLE = 'enrollments';

export interface CourseEnrollmentPayload extends Record<string, unknown> {
  readonly courseOfferingExternalId: string;
  readonly personExternalId: string;
  readonly enrollmentExternalId: string | null;
}

abstract class CourseEnrollmentWriter implements IntentWriter {
  abstract readonly kind: SourceWriteIntent['kind'];

  constructor(
    protected readonly targets: WriteTargetService,
    protected readonly enrollments: CourseEnrollmentWriteRepository,
  ) {}

  abstract execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement>;
  abstract acknowledge(intent: SourceWriteIntent, ack: WriteAcknowledgement): Promise<void>;
  abstract compensate(intent: SourceWriteIntent): Promise<void>;

  abandon(intent: SourceWriteIntent): Promise<void> {
    return this.enrollments.markFailed(intent.canonicalId);
  }

  protected payloadOf(intent: SourceWriteIntent): CourseEnrollmentPayload {
    return intent.payload as unknown as CourseEnrollmentPayload;
  }

  protected async connectorFor(intent: SourceWriteIntent) {
    const target = await this.targets.academic(
      intent.institutionId,
      'courseRegistration.write',
    );

    if (target?.connectorName !== intent.connectorName) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_CONNECTOR_UNAVAILABLE',
        `The "${intent.connectorName}" connector no longer accepts course registration writes`,
      );
    }

    return target.connector;
  }
}

@Injectable()
export class CourseEnrollmentRequestWriter extends CourseEnrollmentWriter {
  readonly kind = 'course_enrollment.request' as const;

  constructor(
    targets: WriteTargetService,
    enrollments: CourseEnrollmentWriteRepository,
    private readonly notifications: EnrollmentNotificationsService,
  ) {
    super(targets, enrollments);
  }

  async execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement> {
    const connector = await this.connectorFor(intent);
    const payload = this.payloadOf(intent);

    if (!connector.registerForCourse) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_COMMAND_UNSUPPORTED',
        `The "${intent.connectorName}" connector declares course registration writes but implements none`,
      );
    }

    return connector.registerForCourse({
      idempotencyKey: intent.id,
      courseOfferingExternalId: payload.courseOfferingExternalId,
      personExternalId: payload.personExternalId,
    });
  }

  async acknowledge(intent: SourceWriteIntent, ack: WriteAcknowledgement): Promise<void> {
    const confirmed = await this.enrollments.confirm(
      intent.canonicalId,
      ack.externalId,
      new Date(),
    );

    if (confirmed) await this.announce(intent, confirmed);
  }

  async compensate(intent: SourceWriteIntent): Promise<void> {
    const rejected = await this.enrollments.reject(intent.canonicalId, new Date());

    if (rejected) await this.announce(intent, rejected);
  }

  private announce(
    intent: SourceWriteIntent,
    enrollment: Parameters<EnrollmentNotificationsService['applied']>[1]['current'],
  ): Promise<void> {
    return this.notifications.applied(
      {
        institutionId: intent.institutionId,
        sourceSystem: 'platform',
        connectorName: intent.connectorName,
      },
      { outcome: 'updated', previous: null, current: enrollment },
      new Date(),
    );
  }
}

@Injectable()
export class CourseEnrollmentWithdrawWriter extends CourseEnrollmentWriter {
  readonly kind = 'course_enrollment.withdraw' as const;

  async execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement> {
    const connector = await this.connectorFor(intent);
    const payload = this.payloadOf(intent);

    if (!connector.withdrawFromCourse) {
      throw new DependencyUnavailableError(
        'WRITE_BACK_COMMAND_UNSUPPORTED',
        `The "${intent.connectorName}" connector declares course registration writes but cannot withdraw one`,
      );
    }

    await connector.withdrawFromCourse({
      idempotencyKey: intent.id,
      courseOfferingExternalId: payload.courseOfferingExternalId,
      personExternalId: payload.personExternalId,
      enrollmentExternalId: payload.enrollmentExternalId,
    });

    return { externalId: null };
  }

  acknowledge(intent: SourceWriteIntent): Promise<void> {
    return this.enrollments.settle(intent.canonicalId, new Date());
  }

  /**
   * Nothing is reversed: the student has already withdrawn here, and putting
   * them back because the registrar refused the message would be worse than the
   * disagreement the stuck write records.
   */
  compensate(): Promise<void> {
    return Promise.resolve();
  }
}
