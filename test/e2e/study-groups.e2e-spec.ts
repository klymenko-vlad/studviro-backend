import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Study groups (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let studentId: string;

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

  const request = (
    actor: { headers: { authorization: string } },
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path = '',
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/study-groups${path}`,
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
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms' })
      .returning();
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
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: term!.id })
      .returning();
    offeringId = offering!.id;

    const student = await harness.actingAs({ email: 'grouped@example.com' });
    studentId = student.user.id;
    await harness.db.insert(enrollments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: studentId,
      status: 'active',
    });
  });

  it('opens a group and puts an enrolled student in it', async () => {
    const admin = await actingAs('institution_admin');

    const created = await request(admin, 'POST', '', {
      code: 'S1',
      kind: 'seminar',
      name: 'Monday seminar',
      capacity: 20,
    });
    expect(created.statusCode).toBe(201);

    const added = await request(admin, 'POST', `/${created.json().id}/members`, {
      userId: studentId,
    });
    expect(added.statusCode).toBe(204);

    const listed = await request(admin, 'GET');
    expect(listed.json()).toEqual([
      expect.objectContaining({
        code: 'S1',
        kind: 'seminar',
        name: 'Monday seminar',
        capacity: 20,
        members: [expect.objectContaining({ userId: studentId })],
      }),
    ]);
  });

  it('will not put somebody who is not enrolled in a group', async () => {
    const admin = await actingAs('institution_admin');
    const outsider = await actingAs('registrar', 'outsider@example.com');
    const { id } = (await request(admin, 'POST', '', { code: 'S1' })).json();

    const response = await request(admin, 'POST', `/${id}/members`, {
      userId: outsider.user.id,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('STUDENT_NOT_ENROLLED');
  });

  it('refuses a second group with the same code on one offering', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', { code: 'S1' });

    const again = await request(admin, 'POST', '', { code: 'S1' });

    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('STUDY_GROUP_CODE_TAKEN');
  });

  it('refuses a member past the capacity', async () => {
    const admin = await actingAs('institution_admin');
    const { id } = (await request(admin, 'POST', '', { code: 'S1', capacity: 0 })).json();

    const response = await request(admin, 'POST', `/${id}/members`, { userId: studentId });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('STUDY_GROUP_FULL');
  });

  it('will not cut capacity below the places already taken', async () => {
    const admin = await actingAs('institution_admin');
    const { id } = (await request(admin, 'POST', '', { code: 'S1' })).json();
    await request(admin, 'POST', `/${id}/members`, { userId: studentId });

    const response = await request(admin, 'PATCH', `/${id}`, { capacity: 0 });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('STUDY_GROUP_CAPACITY_BELOW_TAKEN');
  });

  it('refuses the same student twice in one group', async () => {
    const admin = await actingAs('institution_admin');
    const { id } = (await request(admin, 'POST', '', { code: 'S1' })).json();
    await request(admin, 'POST', `/${id}/members`, { userId: studentId });

    const again = await request(admin, 'POST', `/${id}/members`, { userId: studentId });

    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('STUDY_GROUP_MEMBER_EXISTS');
  });

  it('takes a student out again', async () => {
    const admin = await actingAs('institution_admin');
    const { id } = (await request(admin, 'POST', '', { code: 'S1' })).json();
    await request(admin, 'POST', `/${id}/members`, { userId: studentId });

    const removed = await request(admin, 'DELETE', `/${id}/members/${studentId}`);

    expect(removed.statusCode).toBe(204);
    expect((await request(admin, 'GET')).json()[0].members).toEqual([]);
  });

  it('closes a group and releases everyone in it', async () => {
    const admin = await actingAs('institution_admin');
    const { id } = (await request(admin, 'POST', '', { code: 'S1' })).json();
    await request(admin, 'POST', `/${id}/members`, { userId: studentId });

    const closed = await request(admin, 'DELETE', `/${id}`);

    expect(closed.statusCode).toBe(204);
    expect((await request(admin, 'GET')).json()).toEqual([]);

    const reopened = await request(admin, 'POST', '', { code: 'S1' });
    expect(reopened.statusCode).toBe(201);
  });

  it('lets a registrar see the groups but not change them', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', { code: 'S1' });

    const registrar = await actingAs('registrar', 'nosy@example.com');

    expect((await request(registrar, 'GET')).statusCode).toBe(200);
    expect((await request(registrar, 'POST', '', { code: 'S2' })).statusCode).toBe(403);
  });
});
