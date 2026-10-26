import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses as courses_,
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
      .insert(courses_)
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

  const taughtBy = async (offering: string, teacherId: string) => {
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: offering,
      userId: teacherId,
    });
  };

  const courses = (actor: { headers: { authorization: string } }, userId: string, query = '') =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/teachers/${userId}/offerings${query}`,
      headers: actor.headers,
    });

  it('shows a student who a teacher is and where they work', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);

    const response = await open(student, peter.user.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: peter.user.id,
      displayName: expect.any(String),
      email: 'peter.novak@example.com',
      departments: [expect.objectContaining({ code: 'KI', name: 'Department of Informatics' })],
    });
  });

  it('lists what a teacher teaches, newest term first', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);
    await taughtBy(earlierOfferingId, peter.user.id);

    const response = await courses(student, peter.user.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        { offeringId, courseTitle: 'Algorithms', termName: 'Winter 2026/2027' },
        { offeringId: earlierOfferingId, termName: 'Winter 2025/2026' },
      ],
      meta: { hasNextPage: false, nextCursor: null },
    });
  });

  it('pages through the courses without skipping or repeating one', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);
    await taughtBy(earlierOfferingId, peter.user.id);

    const first = (await courses(student, peter.user.id, '?limit=1')).json();
    const second = (
      await courses(student, peter.user.id, `?limit=1&cursor=${first.meta.nextCursor}`)
    ).json();

    expect(first.items.map((item: { offeringId: string }) => item.offeringId)).toEqual([
      offeringId,
    ]);
    expect(first.meta).toMatchObject({ hasNextPage: true, nextCursor: expect.any(String) });
    expect(second.items.map((item: { offeringId: string }) => item.offeringId)).toEqual([
      earlierOfferingId,
    ]);
    expect(second.meta).toMatchObject({ hasNextPage: false, nextCursor: null });
  });

  it('narrows the courses to a title or code', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);
    const [databases] = await harness.db
      .insert(courses_)
      .values({ institutionId, code: 'INF/DB/22', title: 'Databases' })
      .returning();
    const [term] = await harness.db.select().from(academicTerms).limit(1);
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: databases!.id, academicTermId: term!.id })
      .returning();
    await taughtBy(offering!.id, peter.user.id);

    const byTitle = (await courses(student, peter.user.id, '?q=datab')).json();
    const byCode = (await courses(student, peter.user.id, '?q=INF%2FALG')).json();

    expect(byTitle.items.map((item: { courseTitle: string }) => item.courseTitle)).toEqual([
      'Databases',
    ]);
    expect(byCode.items.map((item: { courseTitle: string }) => item.courseTitle)).toEqual([
      'Algorithms',
    ]);
  });

  it('refuses a cursor it did not issue', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);

    expect((await courses(student, peter.user.id, '?cursor=nonsense')).statusCode).toBe(400);
  });

  it('says which of the teacher’s courses the reader can open', async () => {
    const student = await actingAs('student');
    const peter = await teaching(offeringId);
    await taughtBy(earlierOfferingId, peter.user.id);
    await harness.db.insert(enrollments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: student.user.id,
      status: 'active',
    });

    const { items } = (await courses(student, peter.user.id)).json();

    expect(items).toEqual([
      expect.objectContaining({ offeringId, viewerCanOpen: true }),
      expect.objectContaining({ offeringId: earlierOfferingId, viewerCanOpen: false }),
    ]);
  });

  it('lets an administrator open every course on the profile', async () => {
    const admin = await actingAs('institution_admin');
    const peter = await teaching(offeringId);

    const { items } = (await courses(admin, peter.user.id)).json();

    expect(items).toEqual([expect.objectContaining({ viewerCanOpen: true })]);
  });

  it('lists no courses for somebody who teaches nothing here', async () => {
    const student = await actingAs('student');
    const registrar = await actingAs('registrar', 'registrar@example.com');

    expect((await courses(student, registrar.user.id)).statusCode).toBe(404);
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
