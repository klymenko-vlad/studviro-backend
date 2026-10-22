import { describe, expect, it } from 'vitest';

import type { CourseGrade } from '../../database/schema';

import type { MyCourseResult } from './my-course-results.service';
import { summarizeStudyProgress } from './study-progress';

interface Overrides {
  courseId?: string;
  grade?: CourseGrade | null;
  credits?: number | null;
  attempt?: number;
  annulled?: boolean;
  kind?: 'calculated' | 'proposed' | 'official';
}

const result = ({
  courseId = 'course-1',
  grade = 'B',
  credits = 6,
  attempt = 1,
  annulled = false,
  kind = 'official',
}: Overrides = {}): MyCourseResult =>
  ({
    id: `result-${courseId}-${attempt}`,
    attempt,
    isVoided: annulled,
    effective:
      annulled || grade === null
        ? null
        : { kind, grade, passed: !['FX', 'failed'].includes(grade) },
    course: { id: courseId, code: 'X', title: 'X', credits },
  }) as MyCourseResult;

describe('summarizeStudyProgress', () => {
  it('reports nothing at all for a student with no results', () => {
    expect(summarizeStudyProgress([])).toEqual({
      gradedCourses: 0,
      passedCourses: 0,
      failedCourses: 0,
      creditsEarned: 0,
      creditsAttempted: 0,
      weightedAverage: null,
      awaitingRetake: 0,
    });
  });

  it('earns credits for a pass and attempts them for a fail', () => {
    const progress = summarizeStudyProgress([
      result({ courseId: 'a', grade: 'A', credits: 6 }),
      result({ courseId: 'b', grade: 'FX', credits: 4 }),
    ]);

    expect(progress).toMatchObject({
      passedCourses: 1,
      failedCourses: 1,
      creditsEarned: 6,
      creditsAttempted: 10,
      awaitingRetake: 1,
    });
  });

  it('weights the average by credits rather than counting courses equally', () => {
    const progress = summarizeStudyProgress([
      result({ courseId: 'a', grade: 'A', credits: 9 }),
      result({ courseId: 'b', grade: 'E', credits: 3 }),
    ]);

    expect(progress.weightedAverage).toBe(1.5);
  });

  it('leaves the average null when every course is pass/fail', () => {
    const progress = summarizeStudyProgress([result({ grade: 'passed' })]);

    expect(progress.weightedAverage).toBeNull();
    expect(progress.creditsEarned).toBe(6);
  });

  it('counts only the latest attempt, so a passed resit clears the failure', () => {
    const progress = summarizeStudyProgress([
      result({ courseId: 'a', grade: 'FX', attempt: 1 }),
      result({ courseId: 'a', grade: 'C', attempt: 2 }),
    ]);

    expect(progress).toMatchObject({
      gradedCourses: 1,
      passedCourses: 1,
      failedCourses: 0,
      creditsEarned: 6,
      awaitingRetake: 0,
    });
  });

  it('ignores an annulled result entirely', () => {
    const progress = summarizeStudyProgress([
      result({ courseId: 'a', grade: 'A', annulled: true }),
      result({ courseId: 'b', grade: 'B' }),
    ]);

    expect(progress.gradedCourses).toBe(1);
    expect(progress.creditsEarned).toBe(6);
  });

  it('counts a zero-credit course towards the pass tally and not the average', () => {
    const progress = summarizeStudyProgress([result({ grade: 'A', credits: 0 })]);

    expect(progress.passedCourses).toBe(1);
    expect(progress.weightedAverage).toBeNull();
  });

  it('counts only the registrar’s own record, not a teacher’s proposal', () => {
    const progress = summarizeStudyProgress([
      result({ courseId: 'a', grade: 'A', kind: 'proposed' }),
      result({ courseId: 'b', grade: 'B', kind: 'calculated' }),
      result({ courseId: 'c', grade: 'C', kind: 'official' }),
    ]);

    expect(progress.gradedCourses).toBe(1);
    expect(progress.creditsEarned).toBe(6);
  });
});
