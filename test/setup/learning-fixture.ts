import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  teachingAssignments,
  type CanonicalRole,
} from '../../src/database/schema';

import type { ActingUser, TestHarness } from './app-harness';

export interface LearningFixture {
  readonly institutionId: string;
  readonly offeringId: string;
  readonly otherOfferingId: string;
  readonly admin: ActingUser;
  /** Teaches `offeringId`. */
  readonly teacher: ActingUser;
  /** Teaches `otherOfferingId` only. */
  readonly otherTeacher: ActingUser;
  /** Enrolled on `offeringId`. */
  readonly student: ActingUser;
  /** Enrolled on nothing. */
  readonly stranger: ActingUser;
}

/**
 * One course with a teacher and a student, and a second course with a teacher
 * of its own — the second is what every "somebody else's course" assertion is
 * made against.
 */
export async function seedLearningFixture(harness: TestHarness): Promise<LearningFixture> {
  await harness.truncateAll();

  const [institution] = await harness.db
    .insert(institutions)
    .values({ code: 'upjs', name: 'UPJŠ' })
    .returning();
  const institutionId = institution!.id;

  const [term] = await harness.db
    .insert(academicTerms)
    .values({
      institutionId,
      code: '2026W',
      name: 'Winter 2026/2027',
      academicYear: '2026/2027',
      startsAt: new Date('2026-09-21T00:00:00.000Z'),
      endsAt: new Date('2027-02-14T00:00:00.000Z'),
    })
    .returning();

  const offeringOf = async (code: string, title: string): Promise<string> => {
    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code, title })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: term!.id })
      .returning();

    return offering!.id;
  };

  const offeringId = await offeringOf('INF/ALG/22', 'Algorithms');
  const otherOfferingId = await offeringOf('INF/DBS/22', 'Databases');

  const withRole = async (role: CanonicalRole, email: string): Promise<ActingUser> => {
    const actor = await harness.actingAs({ email });
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  const admin = await withRole('institution_admin', 'admin@example.com');
  const teacher = await withRole('teacher', 'teacher@example.com');
  const otherTeacher = await withRole('teacher', 'other-teacher@example.com');
  const student = await withRole('student', 'student@example.com');
  const stranger = await withRole('student', 'stranger@example.com');

  await harness.db.insert(teachingAssignments).values([
    { institutionId, courseOfferingId: offeringId, userId: teacher.user.id, role: 'lecturer' },
    {
      institutionId,
      courseOfferingId: otherOfferingId,
      userId: otherTeacher.user.id,
      role: 'lecturer',
    },
  ]);

  await harness.db.insert(enrollments).values({
    institutionId,
    courseOfferingId: offeringId,
    userId: student.user.id,
    status: 'active',
  });

  return {
    institutionId,
    offeringId,
    otherOfferingId,
    admin,
    teacher,
    otherTeacher,
    student,
    stranger,
  };
}

export async function putToStore(
  ticket: { url: string; headers: Record<string, string> },
  body: string,
): Promise<number> {
  const response = await fetch(ticket.url, {
    method: 'PUT',
    headers: ticket.headers,
    body,
  });

  return response.status;
}
