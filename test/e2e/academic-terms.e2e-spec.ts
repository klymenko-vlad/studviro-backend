import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  institutions,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const term = {
  code: '2026W',
  name: 'Winter semester 2026/2027',
  academicYear: '2026/2027',
  startsAt: '2026-09-21T00:00:00.000Z',
  endsAt: '2027-02-14T00:00:00.000Z',
  enrollmentOpensAt: '2026-08-24T00:00:00.000Z',
  enrollmentClosesAt: '2026-10-05T00:00:00.000Z',
};

describe('Academic terms (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;

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
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path = '',
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${institutionId}/academic-terms${path}`,
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
  });

  it('creates a term an administrator can then see', async () => {
    const admin = await actingAs('institution_admin');

    const created = await request(admin, 'POST', '', term);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ code: '2026W', kind: 'semester' });

    const listed = await request(admin, 'GET');
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
  });

  it('refuses a second term with the same code', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', term);

    const again = await request(admin, 'POST', '', { ...term, name: 'Another' });

    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('ACADEMIC_TERM_CODE_TAKEN');
  });

  it('refuses a term that ends before it starts', async () => {
    const admin = await actingAs('institution_admin');

    const response = await request(admin, 'POST', '', {
      ...term,
      endsAt: '2026-01-01T00:00:00.000Z',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('ACADEMIC_TERM_ENDS_BEFORE_IT_STARTS');
  });

  it('rejects a malformed date rather than storing an invalid instant', async () => {
    const admin = await actingAs('institution_admin');

    const response = await request(admin, 'POST', '', { ...term, startsAt: 'whenever' });

    expect(response.statusCode).toBe(400);
  });

  it('moves a term and its enrolment window', async () => {
    const admin = await actingAs('institution_admin');
    const { id } = (await request(admin, 'POST', '', term)).json();

    const response = await request(admin, 'PATCH', `/${id}`, {
      enrollmentClosesAt: '2026-10-12T00:00:00.000Z',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().enrollmentClosesAt).toBe('2026-10-12T00:00:00.000Z');
  });

  it('retires a term nothing hangs off, and refuses one that offerings do', async () => {
    const admin = await actingAs('institution_admin');
    const { id } = (await request(admin, 'POST', '', term)).json();

    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms' })
      .returning();
    await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: id });

    const blocked = await request(admin, 'DELETE', `/${id}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('ACADEMIC_TERM_IN_USE');

    await harness.db.delete(courseOfferings);

    const removed = await request(admin, 'DELETE', `/${id}`);
    expect(removed.statusCode).toBe(204);

    const remaining = await request(admin, 'GET');
    expect(remaining.json()).toHaveLength(0);
  });

  it('lets a student read the calendar but never write it', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '', term);

    const registrar = await actingAs('registrar');

    const listed = await request(registrar, 'GET');
    expect(listed.statusCode).toBe(200);

    const denied = await request(registrar, 'POST', '', { ...term, code: '2027S' });
    expect(denied.statusCode).toBe(403);
  });

  it('will not reach into another institution’s calendar', async () => {
    const admin = await actingAs('institution_admin');
    const [other] = await harness.db
      .insert(institutions)
      .values({ code: 'stu', name: 'STU' })
      .returning();
    const [theirs] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId: other!.id,
        code: '2026W',
        name: 'Theirs',
        academicYear: '2026/2027',
        startsAt: new Date(term.startsAt),
        endsAt: new Date(term.endsAt),
      })
      .returning();

    const response = await request(admin, 'PATCH', `/${theirs!.id}`, { name: 'Mine now' });

    expect(response.statusCode).toBe(404);
  });
});
