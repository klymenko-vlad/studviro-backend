import { ConnectorRejectedError } from '../connector-rejected.error';
import type {
  LmsCourseProvisionCommand,
  LmsEnrollmentCommand,
  LmsWriteAcknowledgement,
} from '../learning-system.connector';

export const MOCK_LMS_ARCHIVED_REFUSAL_CODE = 'COURSE_ARCHIVED';

/**
 * The learning system refuses to touch an archived course, named by a `-ARCH`
 * suffix. As with the SIS refusals, it exists so the `rejected` path can be
 * walked at all.
 */
const ARCHIVED_SUFFIX = '-ARCH';

export function provisionCourse(
  command: LmsCourseProvisionCommand,
): Promise<LmsWriteAcknowledgement> {
  if (command.courseOfferingExternalId.endsWith(ARCHIVED_SUFFIX)) {
    return Promise.reject(
      new ConnectorRejectedError(
        MOCK_LMS_ARCHIVED_REFUSAL_CODE,
        'That course is archived in the learning system and cannot be provisioned',
      ),
    );
  }

  return Promise.resolve({
    externalId: `LMS-${command.courseOfferingExternalId}`,
  });
}

export function upsertEnrollment(
  command: LmsEnrollmentCommand,
): Promise<LmsWriteAcknowledgement> {
  if (command.courseExternalId.endsWith(ARCHIVED_SUFFIX)) {
    return Promise.reject(
      new ConnectorRejectedError(
        MOCK_LMS_ARCHIVED_REFUSAL_CODE,
        'That course is archived in the learning system and takes no enrolments',
      ),
    );
  }

  return Promise.resolve({
    externalId: `LMSENR-${command.courseExternalId}-${command.personExternalId}`,
  });
}
