import type {
  SisExamRegistrationCancelCommand,
  SisExamRegistrationCommand,
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

export function acceptExamRegistrationCancellation(
  command: SisExamRegistrationCancelCommand,
): Promise<void> {
  const refusal = refusalFor(command.examTermExternalId);

  return refusal ? Promise.reject(refusal) : Promise.resolve();
}
