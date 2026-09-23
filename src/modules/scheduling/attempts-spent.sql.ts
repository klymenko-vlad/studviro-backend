import { sql, type SQL } from 'drizzle-orm';

import {
  courseOfferings,
  enrollments,
  examRegistrations,
  examTerms,
  FAILING_COURSE_GRADES,
  officialCourseResults,
  VOIDED_COURSE_RESULT_STATUSES,
  type ExamRegistrationStatus,
} from '../../database/schema';

const UNEXCUSED_ABSENCE: ExamRegistrationStatus = 'no_show';

// An `attended` seat is not counted: sitting and failing is already the failed result.
export function attemptsSpentOnOffering(userId: string): SQL<number> {
  return sql<number>`(
    (
      select count(*) from ${officialCourseResults}
      inner join ${enrollments} on ${enrollments.id} = ${officialCourseResults.enrollmentId}
      where ${enrollments.userId} = ${userId}
        and ${enrollments.courseOfferingId} = ${courseOfferings.id}
        and ${enrollments.deletedAt} is null
        and ${officialCourseResults.deletedAt} is null
        and ${officialCourseResults.status} not in ${VOIDED_COURSE_RESULT_STATUSES}
        and ${officialCourseResults.officialGrade} in ${FAILING_COURSE_GRADES}
    ) + (
      select count(*) from ${examRegistrations} as spent_seat
      inner join ${examTerms} as spent_term on spent_term.id = spent_seat.exam_term_id
      where spent_seat.user_id = ${userId}
        and spent_term.course_offering_id = ${courseOfferings.id}
        and spent_seat.status = ${UNEXCUSED_ABSENCE}
        and spent_seat.deleted_at is null
        and spent_term.deleted_at is null
    )
  )`.mapWith(Number);
}
