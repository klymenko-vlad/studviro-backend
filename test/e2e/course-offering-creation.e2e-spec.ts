import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Course offering creation (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let courseId: string;
  let termId: string;

  const actingAs = async (role: CanonicalRole) => {
    const actor = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  const request = (
    actor: { headers: { authorization: string } },
    method: 'GET' | 'POST' | 'DELETE',
    path = '',
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${institutionId}/course-offerings${path}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
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

    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms', credits: '6.00' })
      .returning();
    courseId = course!.id;

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
    termId = term!.id;
  });

  it('puts a course on in a term, and lists it with both names', async () => {
    const admin = await actingAs('institution_admin');

    const created = await request(admin, 'POST', '', {
      courseId,
      academicTermId: termId,
      capacity: 60,
      language: 'sk',
      status: 'open',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ capacity: 60, status: 'open' });

    const listed = await request(admin, 'GET');
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([
      expect.objectContaining({
        courseCode: 'INF/ALG/22',
        courseTitle: 'Algorithms',
        termCode: '2026W',
        termName: 'Winter 2026/2027',
        capacity: 60,
        enrolled: 0,
        teacherCount: 0,
      }),
    ]);
  });

  it('refuses the same course twice in one term', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', { courseId, academicTermId: termId });

    const again = await request(admin, 'POST', '', { courseId, academicTermId: termId });

    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('OFFERING_ALREADY_EXISTS');
  });

  it('404s on a course or a term that is not this institution’s', async () => {
    const admin = await actingAs('institution_admin');
    const stranger = '11111111-1111-4111-8111-111111111111';

    expect(
      (await request(admin, 'POST', '', { courseId: stranger, academicTermId: termId }))
        .statusCode,
    ).toBe(404);
    expect(
      (await request(admin, 'POST', '', { courseId, academicTermId: stranger })).statusCode,
    ).toBe(404);
  });

  it('defaults the org unit to the course’s own', async () => {
    const admin = await actingAs('institution_admin');

    const created = await request(admin, 'POST', '', { courseId, academicTermId: termId });

    expect(created.statusCode).toBe(201);
  });

  it('counts the places already taken', async () => {
    const admin = await actingAs('institution_admin');
    const offering = (
      await request(admin, 'POST', '', { courseId, academicTermId: termId, capacity: 10 })
    ).json();

    const student = await harness.actingAs({ email: 'enrolled@example.com' });
    await harness.db.insert(enrollments).values({
      institutionId,
      courseOfferingId: offering.id,
      userId: student.user.id,
      status: 'active',
    });

    const listed = await request(admin, 'GET');

    expect(listed.json()[0]).toMatchObject({ enrolled: 1, capacity: 10 });
  });

  it('retires an offering nobody enrolled on, and refuses one they did', async () => {
    const admin = await actingAs('institution_admin');
    const offering = (
      await request(admin, 'POST', '', { courseId, academicTermId: termId })
    ).json();

    const student = await harness.actingAs({ email: 'enrolled2@example.com' });
    await harness.db.insert(enrollments).values({
      institutionId,
      courseOfferingId: offering.id,
      userId: student.user.id,
      status: 'active',
    });

    const blocked = await request(admin, 'DELETE', `/${offering.id}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('OFFERING_HAS_ENROLLMENTS');

    await harness.db.delete(enrollments);

    const retired = await request(admin, 'DELETE', `/${offering.id}`);
    expect(retired.statusCode).toBe(204);
    expect((await request(admin, 'GET')).json()).toHaveLength(0);
  });

  it('lets a student read the offerings but not create one', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', { courseId, academicTermId: termId });

    const registrar = await actingAs('registrar');

    expect((await request(registrar, 'GET')).statusCode).toBe(200);

    const denied = await request(registrar, 'POST', '', {
      courseId,
      academicTermId: termId,
    });
    expect(denied.statusCode).toBe(403);
  });

  it('shows one institution nothing of another’s offerings', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', { courseId, academicTermId: termId });

    const [other] = await harness.db
      .insert(institutions)
      .values({ code: 'stu', name: 'STU' })
      .returning();
    const otherAdmin = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId: other!.id,
      userId: otherAdmin.user.id,
      role: 'institution_admin',
      scopeType: 'institution',
      scopeId: null,
    });

    const theirs = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${other!.id}/course-offerings`,
      headers: otherAdmin.headers,
    });

    expect(theirs.json()).toEqual([]);
  });
});
