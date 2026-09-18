import type {
  SisCourseRegistrationCommand,
  SisCourseWithdrawalCommand,
  SisExamRegistrationCancelCommand,
  SisExamRegistrationCommand,
  SisResultPublicationCommand,
  SisWriteAcknowledgement,
} from '../academic-system.connector';
import { ConnectorRejectedError } from '../connector-rejected.error';

/**
 * A retake seat is booked at the study department, not by the student, so the
 * mock registrar refuses one. It is the only refusal it gives, and it exists so
 * the `rejected` path can actually be walked.
 */
const REFUSED_EXAM_TERM_SUFFIXES = ['-first_retake', '-second_retake'];

export const MOCK_SIS_RETAKE_REFUSAL_CODE = 'RETAKE_NOT_SELF_SERVICE';

function refusalFor(examTermExternalId: string): ConnectorRejectedError | null {
  if (!REFUSED_EXAM_TERM_SUFFIXES.some((suffix) => examTermExternalId.endsWith(suffix))) {
    return null;
  }

  return new ConnectorRejectedError(
    MOCK_SIS_RETAKE_REFUSAL_CODE,
    'A retake seat is assigned by the study department and cannot be booked by the student',
  );
}

export function acceptExamRegistration(
  command: SisExamRegistrationCommand,
): Promise<SisWriteAcknowledgement> {
  const refusal = refusalFor(command.examTermExternalId);
  if (refusal) return Promise.reject(refusal);

  return Promise.resolve({
    externalId: `EXR-${command.examTermExternalId}-${command.personExternalId}`,
  });
}

export const MOCK_SIS_FULL_COURSE_REFUSAL_CODE = 'COURSE_QUOTA_EXHAUSTED';

/**
 * The registrar refuses a course whose external identifier ends in `-99`. As
 * with the retake rule, it exists so the `rejected` path can be walked at all.
 */
const REFUSED_OFFERING_SUFFIX = '-99';

export function acceptCourseRegistration(
  command: SisCourseRegistrationCommand,
): Promise<SisWriteAcknowledgement> {
  if (command.courseOfferingExternalId.endsWith(REFUSED_OFFERING_SUFFIX)) {
    return Promise.reject(
      new ConnectorRejectedError(
        MOCK_SIS_FULL_COURSE_REFUSAL_CODE,
        'The registrar has no quota left on that course',
      ),
    );
  }

  return Promise.resolve({
    externalId: `ENR-${command.courseOfferingExternalId}-${command.personExternalId}`,
  });
}

export function acceptCourseWithdrawal(command: SisCourseWithdrawalCommand): Promise<void> {
  return command.courseOfferingExternalId.endsWith(REFUSED_OFFERING_SUFFIX)
    ? Promise.reject(
        new ConnectorRejectedError(
          MOCK_SIS_FULL_COURSE_REFUSAL_CODE,
          'The registrar will not release that course',
        ),
      )
    : Promise.resolve();
}

export const MOCK_SIS_GRADE_LOCKED_REFUSAL_CODE = 'GRADE_PERIOD_CLOSED';

/**
 * The registrar will not take a grade past the second attempt: beyond that a
 * result is settled by the study department, not by the examiner. It is the
 * refusal the `rejected` path is walked with on this intent.
 */
const MAX_ACCEPTED_ATTEMPT = 2;

export function acceptResultPublication(
  command: SisResultPublicationCommand,
): Promise<SisWriteAcknowledgement> {
  if (command.attempt > MAX_ACCEPTED_ATTEMPT) {
    return Promise.reject(
      new ConnectorRejectedError(
        MOCK_SIS_GRADE_LOCKED_REFUSAL_CODE,
        'A third attempt is recorded by the study department, not by the examiner',
      ),
    );
  }

  return Promise.resolve({
    externalId: `RES-${command.enrollmentExternalId}-${command.attempt}`,
  });
}

export function acceptExamRegistrationCancellation(
  command: SisExamRegistrationCancelCommand,
): Promise<void> {
  const refusal = refusalFor(command.examTermExternalId);

  return refusal ? Promise.reject(refusal) : Promise.resolve();
}
