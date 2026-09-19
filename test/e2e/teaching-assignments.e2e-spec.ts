import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  institutions,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { DerivedRolesRepository } from '../../src/modules/authorization/derived-roles.repository';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Teaching assignments (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;

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
    method: 'GET' | 'POST' | 'DELETE',
    path = '',
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/teaching${path}`,
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
  });

  it('makes somebody a teacher, and the role derives from it immediately', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'lecturer@example.com');
    const derived = harness.app.get(DerivedRolesRepository);

    await expect(derived.findFor(institutionId, person.user.id)).resolves.toEqual([]);

    const assigned = await request(admin, 'POST', '', {
      userId: person.user.id,
      role: 'lecturer',
      isPrimary: true,
    });
    expect(assigned.statusCode).toBe(201);

    await expect(derived.findFor(institutionId, person.user.id)).resolves.toEqual([
      expect.objectContaining({ role: 'teacher' }),
    ]);

    const listed = await request(admin, 'GET');
    expect(listed.json()).toEqual([
      expect.objectContaining({
        userId: person.user.id,
        role: 'lecturer',
        isPrimary: true,
        email: 'lecturer@example.com',
      }),
    ]);
  });

  it('takes the role away again when the assignment goes', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'lecturer2@example.com');
    const derived = harness.app.get(DerivedRolesRepository);

    const { id } = (await request(admin, 'POST', '', { userId: person.user.id })).json();

    const removed = await request(admin, 'DELETE', `/${id}`);
    expect(removed.statusCode).toBe(204);

    await expect(derived.findFor(institutionId, person.user.id)).resolves.toEqual([]);
    expect((await request(admin, 'GET')).json()).toEqual([]);
  });

  it('refuses the same person in the same role twice', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'lecturer3@example.com');
    await request(admin, 'POST', '', { userId: person.user.id, role: 'lecturer' });

    const again = await request(admin, 'POST', '', {
      userId: person.user.id,
      role: 'lecturer',
    });

    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('TEACHING_ASSIGNMENT_EXISTS');
  });

  it('allows the same person in a second role on the same offering', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'lecturer4@example.com');
    await request(admin, 'POST', '', { userId: person.user.id, role: 'lecturer' });

    const second = await request(admin, 'POST', '', {
      userId: person.user.id,
      role: 'seminar_leader',
    });

    expect(second.statusCode).toBe(201);
    expect((await request(admin, 'GET')).json()).toHaveLength(2);
  });

  it('keeps at most one primary — promoting a second demotes the first', async () => {
    const admin = await actingAs('institution_admin');
    const first = await actingAs('registrar', 'first@example.com');
    const second = await actingAs('registrar', 'second@example.com');

    await request(admin, 'POST', '', { userId: first.user.id, isPrimary: true });
    await request(admin, 'POST', '', {
      userId: second.user.id,
      role: 'seminar_leader',
      isPrimary: true,
    });

    const listed = await request(admin, 'GET');
    const primaries = listed.json().filter((row: { isPrimary: boolean }) => row.isPrimary);

    expect(primaries).toHaveLength(1);
    expect(primaries[0].userId).toBe(second.user.id);
  });

  it('will not make a stranger to the institution its teacher', async () => {
    const admin = await actingAs('institution_admin');
    const stranger = await harness.actingAs({ email: 'stranger@example.com' });

    const response = await request(admin, 'POST', '', { userId: stranger.user.id });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('PERSON_NOT_IN_INSTITUTION');
  });

  it('404s on a user who does not exist at all', async () => {
    const admin = await actingAs('institution_admin');

    const response = await request(admin, 'POST', '', {
      userId: '11111111-1111-4111-8111-111111111111',
    });

    expect(response.statusCode).toBe(404);
  });

  it('lets a registrar see who teaches but not change it', async () => {
    const admin = await actingAs('institution_admin');
    const registrar = await actingAs('registrar', 'reg@example.com');

    expect((await request(registrar, 'GET')).statusCode).toBe(200);

    const denied = await request(registrar, 'POST', '', { userId: admin.user.id });
    expect(denied.statusCode).toBe(403);
  });
});
