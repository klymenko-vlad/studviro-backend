import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  orgUnits,
  roleAssignments,
  teachingAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Teacher profile (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let earlierOfferingId: string;

  const actingAs = async (role: CanonicalRole, email?: string) => {
    const actor = await harness.actingAs(email === undefined ? {} : { email });
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  const teaching = async (offering: string, email = 'peter.novak@example.com') => {
    const teacher = await harness.actingAs({ email });
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: offering,
      userId: teacher.user.id,
      isPrimary: true,
    });

    return teacher;
  };

  const open = (
    actor: { headers: { authorization: string } } | null,
    userId: string,
    institution = institutionId,
  ) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institution}/teachers/${userId}`,
      ...(actor === null ? {} : { headers: actor.headers }),
    });

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [institution] = await harness.db
      .insert(institutions)
      .values({ code: 'upjs', name: 'UPJŠ' })
      .returning();
    institutionId = institution!.id;

    const [department] = await harness.db
      .insert(orgUnits)
      .values({ institutionId, code: 'KI', name: 'Department of Informatics' })
      .returning();
    const [course] = await harness.db
      .insert(courses)
      .values({
        institutionId,
        code: 'INF/ALG/22',
        title: 'Algorithms',
        orgUnitId: department!.id,
      })
      .returning();
    const [winter] = await harness.db
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
    const [earlier] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2025W',
        name: 'Winter 2025/2026',
        academicYear: '2025/2026',
        startsAt: new Date('2025-09-22T00:00:00.000Z'),
        endsAt: new Date('2026-02-15T00:00:00.000Z'),
      })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: winter!.id })
      .returning();
    offeringId = offering!.id;
    const [earlierOffering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: earlier!.id })
      .returning();
    earlierOfferingId = earlierOffering!.id;
  });

  it('shows a student who a teacher is, where they work and what they teach', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: earlierOfferingId,
      userId: peter.user.id,
    });

    const response = await open(student, peter.user.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: peter.user.id,
      email: 'peter.novak@example.com',
      departments: [{ code: 'KI', name: 'Department of Informatics' }],
      offerings: [
        { offeringId, courseTitle: 'Algorithms', termName: 'Winter 2026/2027' },
        { offeringId: earlierOfferingId, termName: 'Winter 2025/2026' },
      ],
    });
  });

  it('says which of the teacher’s courses the reader can open', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: earlierOfferingId,
      userId: peter.user.id,
    });
    await harness.db.insert(enrollments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: student.user.id,
      status: 'active',
    });

    const { offerings } = (await open(student, peter.user.id)).json();

    expect(offerings).toEqual([
      expect.objectContaining({ offeringId, viewerCanOpen: true }),
      expect.objectContaining({ offeringId: earlierOfferingId, viewerCanOpen: false }),
    ]);
  });

  it('lets an administrator open every course on the profile', async () => {
    const admin = await actingAs('institution_admin');
    const peter = await teaching(offeringId);

    const { offerings } = (await open(admin, peter.user.id)).json();

    expect(offerings).toEqual([expect.objectContaining({ viewerCanOpen: true })]);
  });

  it('has no profile for somebody who teaches nothing here', async () => {
    const student = await actingAs('student');
    const registrar = await actingAs('registrar', 'registrar@example.com');

    expect((await open(student, registrar.user.id)).statusCode).toBe(404);
  });

  it('forgets a teaching assignment that was removed', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);
    await harness.db.update(teachingAssignments).set({ deletedAt: new Date() });

    expect((await open(student, peter.user.id)).statusCode).toBe(404);
  });

  it('does not show one institution’s teacher through another', async () => {
    const peter = await teaching(offeringId);
    const [other] = await harness.db
      .insert(institutions)
      .values({ code: 'stu', name: 'STU' })
      .returning();
    const stranger = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId: other!.id,
      userId: stranger.user.id,
      role: 'student',
      scopeType: 'institution',
      scopeId: null,
    });

    expect((await open(stranger, peter.user.id, other!.id)).statusCode).toBe(404);
    expect((await open(stranger, peter.user.id)).statusCode).toBe(403);
  });

  it('turns an anonymous caller away', async () => {
    const peter = await teaching(offeringId);

    expect((await open(null, peter.user.id)).statusCode).toBe(401);
  });
});
