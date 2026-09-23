import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import { ENROLLMENT_WITHDRAWABLE_STATUSES, type Enrollment } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { EnrollmentNotificationsService } from '../notifications/enrollment-notifications.service';

import { windowState } from './enrollable-offerings.service';
import { MyEnrollmentsRepository, type EnrollableRow } from './my-enrollments.repository';

const OPEN_OFFERING_STATUSES = ['planned', 'open', 'running'];

@Injectable()
export class MyEnrollmentsService {
  constructor(
    private readonly repository: MyEnrollmentsRepository,
    private readonly txHost: TransactionHost,
    private readonly notifications: EnrollmentNotificationsService,
  ) {}

  /**
   * Asking for a place is getting one. The row is written `requested` and
   * activated in the same call, because StudViro is the system of record and
   * there is nobody upstream to approve it (ADR 0024).
   *
   * The two steps are kept apart rather than inserting `active` directly: the
   * capacity check and the seat it claims happen inside one serializable
   * transaction, and `requested` is the state that holds that seat while the
   * transaction decides. The status ladder still has the rungs a registrar
   * would need if a place ever had to be approved by hand.
   */
  async request(
    institutionId: string,
    userId: string,
    offeringId: string,
    now = new Date(),
  ): Promise<Enrollment> {
    const enrollment = await this.txHost.runSerializable(async () => {
      const offering = await this.repository.findEnrollable(institutionId, userId, offeringId);
      if (!offering) throw new EntityNotFoundError('course offering', offeringId);

      this.assertOnOffer(offering);
      this.assertOpen(offering, now);
      this.assertNotAlreadyIn(offering);
      await this.assertStudent(institutionId, userId);
      this.assertSeatFree(offering);

      return offering.myEnrollmentId
        ? this.repository.reopen(offering.myEnrollmentId, now)
        : this.repository.request(institutionId, userId, offeringId, now);
    });

    // StudViro is the system of record, so a place asked for is a place given:
    // there is nobody upstream to approve it (ADR 0024).
    await this.repository.activate(enrollment.id, now);
    await this.notifications.applied(
      institutionId,
      { previous: enrollment, current: { ...enrollment, status: 'active' } },
      now,
    );

    return { ...enrollment, status: 'active' };
  }

  async joinWaitlist(
    institutionId: string,
    userId: string,
    offeringId: string,
    now = new Date(),
  ): Promise<Enrollment> {
    return this.txHost.runSerializable(async () => {
      const offering = await this.repository.findEnrollable(institutionId, userId, offeringId);
      if (!offering) throw new EntityNotFoundError('course offering', offeringId);

      this.assertOnOffer(offering);
      this.assertOpen(offering, now);
      this.assertNotAlreadyIn(offering, { waiting: 'refuse' });
      await this.assertStudent(institutionId, userId);
      this.assertFull(offering);

      return offering.myEnrollmentId
        ? this.repository.rejoinWaitlist(offering.myEnrollmentId, now)
        : this.repository.joinWaitlist(institutionId, userId, offeringId, now);
    });
  }

  async withdraw(
    institutionId: string,
    userId: string,
    enrollmentId: string,
    now = new Date(),
  ): Promise<Enrollment> {
    return this.txHost.run(async () => {
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
      if (offering && existing.status !== 'waitlisted') this.assertOpen(offering, now);

      return this.repository.withdraw(enrollmentId, now);
    });
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

  private assertNotAlreadyIn(
    offering: EnrollableRow,
    { waiting }: { waiting: 'allow' | 'refuse' } = { waiting: 'allow' },
  ): void {
    const status = offering.myStatus;
    if (status === null || status === 'withdrawn' || status === 'rejected') return;
    if (status === 'waitlisted' && waiting === 'allow') return;

    throw new ConflictError(
      status === 'completed' ? 'ENROLLMENT_COMPLETED' : 'ENROLLMENT_ALREADY_HELD',
      status === 'completed'
        ? 'You have already completed that course'
        : 'You already hold a place, a request or a place in the queue on that course',
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

  private assertFull(offering: EnrollableRow): void {
    if (offering.capacity !== null && offering.occupiedSeats >= offering.capacity) return;

    throw new ConflictError(
      'OFFERING_NOT_FULL',
      'That course has a place free, so take the place instead of queueing for one',
      { offeringId: offering.offeringId },
    );
  }
}
