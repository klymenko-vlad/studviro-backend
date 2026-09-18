import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import { ENROLLMENT_WITHDRAWABLE_STATUSES, type Enrollment } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { CourseEnrollmentWriteBackService } from '../write-back/course-enrollment-write-back.service';

import { windowState } from './enrollable-offerings.service';
import { MyEnrollmentsRepository, type EnrollableRow } from './my-enrollments.repository';

const OPEN_OFFERING_STATUSES = ['planned', 'open', 'running'];

@Injectable()
export class MyEnrollmentsService {
  constructor(
    private readonly repository: MyEnrollmentsRepository,
    private readonly txHost: TransactionHost,
    private readonly writeBack: CourseEnrollmentWriteBackService,
  ) {}

  /**
   * A request, not a place. It becomes `active` when the registrar's system
   * acknowledges it, or immediately where no connector can be told — the
   * status ladder finally used as the schema always described it.
   */
  async request(
    institutionId: string,
    userId: string,
    offeringId: string,
    now = new Date(),
  ): Promise<Enrollment> {
    const { enrollment, outcome } = await this.txHost.run(
      async () => {
        const offering = await this.repository.findEnrollable(
          institutionId,
          userId,
          offeringId,
        );
        if (!offering) throw new EntityNotFoundError('course offering', offeringId);

        this.assertOnOffer(offering);
        this.assertOpen(offering, now);
        this.assertNotAlreadyIn(offering);
        await this.assertStudent(institutionId, userId);
        this.assertSeatFree(offering);

        const created = offering.myEnrollmentId
          ? await this.repository.reopen(offering.myEnrollmentId, now)
          : await this.repository.request(institutionId, userId, offeringId, now);

        return {
          enrollment: created,
          outcome: await this.writeBack.enqueueRequest(created, userId),
        };
      },
      { isolationLevel: 'serializable' },
    );

    if (outcome.kind === 'not_writable') {
      await this.repository.activate(enrollment.id, now);

      return { ...enrollment, status: 'active', synchronizationStatus: 'in_sync' };
    }

    await this.writeBack.publish(institutionId, outcome);

    return enrollment;
  }

  async withdraw(
    institutionId: string,
    userId: string,
    enrollmentId: string,
    now = new Date(),
  ): Promise<Enrollment> {
    const { enrollment, outcome } = await this.txHost.run(async () => {
      const existing = await this.repository.findMine(institutionId, userId, enrollmentId);
      if (!existing) throw new EntityNotFoundError('enrollment', enrollmentId);

      if (!ENROLLMENT_WITHDRAWABLE_STATUSES.includes(existing.status)) {
        throw new ConflictError(
          'ENROLLMENT_NOT_WITHDRAWABLE',
          'That enrolment is not one you can withdraw from',
          { status: existing.status },
        );
      }

      const offering = await this.repository.findEnrollable(
        institutionId,
        userId,
        existing.courseOfferingId,
      );
      if (offering) this.assertOpen(offering, now);

      const enqueued = await this.writeBack.enqueueWithdrawal(existing, userId);

      return {
        enrollment: await this.repository.withdraw(enrollmentId, now),
        outcome: enqueued,
      };
    });

    await this.writeBack.publish(institutionId, outcome);

    return enrollment;
  }

  private assertOnOffer(offering: EnrollableRow): void {
    if (OPEN_OFFERING_STATUSES.includes(offering.offeringStatus)) return;

    throw new InvalidInputError(
      'OFFERING_NOT_ON_OFFER',
      'That course is not on offer this term',
      { status: offering.offeringStatus },
    );
  }

  private assertOpen(offering: EnrollableRow, now: Date): void {
    const state = windowState(offering, now);
    if (state === 'open') return;

    throw new InvalidInputError(
      state === 'not_open' ? 'ENROLLMENT_NOT_OPEN' : 'ENROLLMENT_CLOSED',
      state === 'not_open'
        ? 'Enrolment for that term has not opened yet'
        : 'Enrolment for that term has closed',
      {
        enrollmentOpensAt: offering.enrollmentOpensAt,
        enrollmentClosesAt: offering.enrollmentClosesAt,
      },
    );
  }

  private assertNotAlreadyIn(offering: EnrollableRow): void {
    const status = offering.myStatus;
    if (status === null || status === 'withdrawn' || status === 'rejected') return;

    throw new ConflictError(
      status === 'completed' ? 'ENROLLMENT_COMPLETED' : 'ENROLLMENT_ALREADY_HELD',
      status === 'completed'
        ? 'You have already completed that course'
        : 'You already hold a place, or a request, on that course',
      { status },
    );
  }

  private async assertStudent(institutionId: string, userId: string): Promise<void> {
    if (await this.repository.isStudent(institutionId, userId)) return;

    throw new InvalidInputError(
      'ENROLLMENT_NOT_A_STUDENT',
      'Only a student of a programme at this institution can take its courses',
    );
  }

  private assertSeatFree(offering: EnrollableRow): void {
    if (offering.capacity === null || offering.occupiedSeats < offering.capacity) return;

    throw new ConflictError('OFFERING_FULL', 'That course has no places left', {
      offeringId: offering.offeringId,
    });
  }
}
