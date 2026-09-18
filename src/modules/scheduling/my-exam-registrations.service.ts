import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import type { ExamRegistration } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { ExamRegistrationWriteBackService } from '../write-back/exam-registration-write-back.service';

import {
  MyExamRegistrationsRepository,
  type LiveRegistrationRow,
  type RegistrableExamTermRow,
} from './my-exam-registrations.repository';

@Injectable()
export class MyExamRegistrationsService {
  constructor(
    private readonly repository: MyExamRegistrationsRepository,
    private readonly txHost: TransactionHost,
    private readonly writeBack: ExamRegistrationWriteBackService,
  ) {}

  async register(
    institutionId: string,
    userId: string,
    examTermId: string,
    now = new Date(),
  ): Promise<ExamRegistration> {
    const { registration, outcome } = await this.txHost.run(
      async () => {
        const term = await this.repository.findRegistrableTerm(
          institutionId,
          userId,
          examTermId,
        );

        if (!term) throw new EntityNotFoundError('exam term', examTermId);

        this.assertEnrolled(term);
        this.assertOpen(term, now);
        await this.assertNotAlreadyRegistered(institutionId, userId, term);
        this.assertSeatFree(term);

        const created = await this.repository.register(institutionId, userId, examTermId, now);

        return {
          registration: created,
          outcome: await this.writeBack.enqueueCreate(created, userId),
        };
      },
      { isolationLevel: 'serializable' },
    );

    await this.writeBack.publish(institutionId, outcome);

    return registration;
  }

  async cancel(
    institutionId: string,
    userId: string,
    registrationId: string,
    now = new Date(),
  ): Promise<ExamRegistration> {
    const { registration, outcome } = await this.txHost.run(async () => {
      const existing = await this.repository.findLiveRegistrationById(
        institutionId,
        userId,
        registrationId,
      );

      if (!existing) throw new EntityNotFoundError('exam registration', registrationId);

      this.assertCancellable(existing, now);

      // Enqueued before the row is soft-deleted, because the intent needs the
      // identifiers the row carries.
      const enqueued = await this.writeBack.enqueueCancel(existing.registration, userId);

      return {
        registration: await this.repository.cancel(registrationId, now),
        outcome: enqueued,
      };
    });

    await this.writeBack.publish(institutionId, outcome);

    return registration;
  }

  private assertEnrolled(term: RegistrableExamTermRow): void {
    if (term.enrolled) return;

    throw new InvalidInputError(
      'EXAM_TERM_NOT_ENROLLED',
      'Only a student enrolled in the course can register for its exam',
      { examTermId: term.examTermId },
    );
  }

  private assertOpen(term: RegistrableExamTermRow, now: Date): void {
    if (term.cancelledAt !== null) {
      throw new InvalidInputError('EXAM_TERM_CANCELLED', 'That exam term has been cancelled', {
        examTermId: term.examTermId,
      });
    }

    if (term.registrationOpensAt !== null && now < term.registrationOpensAt) {
      throw new InvalidInputError(
        'EXAM_REGISTRATION_NOT_OPEN',
        'Registration for that exam term has not opened yet',
        { registrationOpensAt: term.registrationOpensAt },
      );
    }

    if (term.registrationClosesAt !== null && now >= term.registrationClosesAt) {
      throw new InvalidInputError(
        'EXAM_REGISTRATION_CLOSED',
        'Registration for that exam term has closed',
        { registrationClosesAt: term.registrationClosesAt },
      );
    }
  }

  private async assertNotAlreadyRegistered(
    institutionId: string,
    userId: string,
    term: RegistrableExamTermRow,
  ): Promise<void> {
    const live = await this.repository.findLiveRegistrationForOffering(
      institutionId,
      userId,
      term.offeringId,
    );

    if (!live) return;

    if (live.examTermId === term.examTermId) {
      throw new ConflictError(
        'EXAM_ALREADY_REGISTERED',
        'You are already registered for that exam term',
        { registrationId: live.registration.id },
      );
    }

    throw new ConflictError(
      'EXAM_ALREADY_REGISTERED_FOR_COURSE',
      'You already hold a registration for another term of this course',
      { registrationId: live.registration.id, examTermId: live.examTermId },
    );
  }

  private assertSeatFree(term: RegistrableExamTermRow): void {
    if (term.capacity === null || term.registeredCount < term.capacity) return;

    throw new ConflictError('EXAM_TERM_FULL', 'That exam term has no seats left', {
      examTermId: term.examTermId,
    });
  }

  private assertCancellable(registration: LiveRegistrationRow, now: Date): void {
    if (registration.termCancelledAt !== null) return;

    if (
      registration.registrationClosesAt !== null &&
      now >= registration.registrationClosesAt
    ) {
      throw new InvalidInputError(
        'EXAM_REGISTRATION_CLOSED',
        'Registration for that exam term has closed and can no longer be cancelled',
        { registrationClosesAt: registration.registrationClosesAt },
      );
    }
  }
}
