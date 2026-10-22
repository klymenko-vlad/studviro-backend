import { COURSE_GRADE_POINTS, type CourseGrade } from '../../database/schema';

import type { MyCourseResult } from './my-course-results.service';

export interface StudyProgress {
  /** Courses with a standing result — annulled ones are not among them. */
  gradedCourses: number;
  passedCourses: number;
  failedCourses: number;
  creditsEarned: number;
  creditsAttempted: number;
  /** Credit-weighted mean on the 1–4 scale, or null when nothing carries points. */
  weightedAverage: number | null;
  /** Courses the student must resit: failed, with no later passing attempt. */
  awaitingRetake: number;
}

const AVERAGE_DECIMALS = 2;

/**
 * The totals B4 said were uncomputable. Pass, fail and the point scale live in
 * one place beside the enum; this only adds them up, and a course the student
 * has since passed no longer counts as awaiting a resit.
 */
export function summarizeStudyProgress(results: readonly MyCourseResult[]): StudyProgress {
  // Only the registrar's own record counts. A proposed grade is a teacher's
  // intention, not a credit, and a calculated one is arithmetic.
  const standing = results.filter((result) => result.effective?.kind === 'official');
  const bestByCourse = latestAttemptPerCourse(standing);

  let creditsEarned = 0;
  let creditsAttempted = 0;
  let weightedPoints = 0;
  let weightedCredits = 0;
  let passedCourses = 0;
  let failedCourses = 0;
  let awaitingRetake = 0;

  for (const result of bestByCourse) {
    const effective = result.effective;
    if (!effective) continue;

    const credits = result.course.credits ?? 0;

    creditsAttempted += credits;

    if (effective.passed) {
      passedCourses += 1;
      creditsEarned += credits;
    } else {
      failedCourses += 1;
      awaitingRetake += 1;
    }

    const points = pointsFor(effective.grade);
    if (points !== undefined && credits > 0) {
      weightedPoints += points * credits;
      weightedCredits += credits;
    }
  }

  return {
    gradedCourses: bestByCourse.length,
    passedCourses,
    failedCourses,
    creditsEarned,
    creditsAttempted,
    weightedAverage:
      weightedCredits === 0
        ? null
        : Number((weightedPoints / weightedCredits).toFixed(AVERAGE_DECIMALS)),
    awaitingRetake,
  };
}

function pointsFor(grade: CourseGrade): number | undefined {
  return COURSE_GRADE_POINTS[grade];
}

/**
 * A resit is a second result for the same course, so only the last attempt
 * counts towards credits and the average — otherwise a student who passed on
 * the retake would still carry the FX.
 */
function latestAttemptPerCourse(results: readonly MyCourseResult[]): MyCourseResult[] {
  const byCourse = new Map<string, MyCourseResult>();

  for (const result of results) {
    const held = byCourse.get(result.course.id);
    if (!held || result.attempt > held.attempt) byCourse.set(result.course.id, result);
  }

  return [...byCourse.values()];
}
