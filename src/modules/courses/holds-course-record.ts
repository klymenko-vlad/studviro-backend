import { eq, inArray, sql, type SQL } from 'drizzle-orm';

import {
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  officialCourseResults,
} from '../../database/schema';

export function holdsCourseRecord(): SQL {
  const keptGrade = sql`exists (select 1 from ${officialCourseResults} where ${officialCourseResults.enrollmentId} = ${enrollments.id} and ${officialCourseResults.officialGrade} is not null and ${officialCourseResults.deletedAt} is null)`;

  return sql`(${inArray(enrollments.status, [...ENROLLMENT_RECORDED_STATUSES])} or (${eq(enrollments.status, 'withdrawn')} and ${keptGrade}))`;
}
