import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  institutions,
  invitations,
  programs,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { DerivedRolesRepository } from '../../src/modules/authorization/derived-roles.repository';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Programme memberships (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let programId: string;

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
      url: `/api/v1/institutions/${institutionId}/programs/${programId}/members${path}`,
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

    const [program] = await harness.db
      .insert(programs)
      .values({ institutionId, code: 'INF-BC', name: 'Informatics' })
      .returning();
    programId = program!.id;
  });

  it('makes somebody a student, and the role derives from it immediately', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'fresher@example.com');
    const derived = harness.app.get(DerivedRolesRepository);

    await expect(derived.findFor(institutionId, person.user.id)).resolves.toEqual([]);

    const admitted = await request(admin, 'POST', '', {
      userId: person.user.id,
      studyYear: 1,
    });
    expect(admitted.statusCode).toBe(201);

    await expect(derived.findFor(institutionId, person.user.id)).resolves.toEqual([
      expect.objectContaining({ role: 'student' }),
    ]);

    const listed = await request(admin, 'GET');
    expect(listed.json()).toEqual([
      expect.objectContaining({
        userId: person.user.id,
        status: 'active',
        studyYear: 1,
        email: 'fresher@example.com',
      }),
    ]);
  });

  it('stamps a start date so the membership has a beginning', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'dated@example.com');

    await request(admin, 'POST', '', { userId: person.user.id });

    expect((await request(admin, 'GET')).json()[0].startedAt).not.toBeNull();
  });

  it('takes the student role away when the membership is no longer active', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'graduand@example.com');
    const derived = harness.app.get(DerivedRolesRepository);

    const { id } = (await request(admin, 'POST', '', { userId: person.user.id })).json();

    const graduated = await request(admin, 'PATCH', `/${id}`, { status: 'graduated' });
    expect(graduated.statusCode).toBe(200);
    expect(graduated.json().endedAt).not.toBeNull();

    await expect(derived.findFor(institutionId, person.user.id)).resolves.toEqual([]);
  });

  it('clears the end date when a membership resumes', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'returner@example.com');
    const { id } = (await request(admin, 'POST', '', { userId: person.user.id })).json();

    await request(admin, 'PATCH', `/${id}`, { status: 'interrupted' });
    const resumed = await request(admin, 'PATCH', `/${id}`, { status: 'active' });

    expect(resumed.json()).toMatchObject({ status: 'active', endedAt: null });
  });

  it('moves a student up a year without touching anything else', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'secondyear@example.com');
    const { id } = (
      await request(admin, 'POST', '', { userId: person.user.id, studyYear: 1 })
    ).json();

    const moved = await request(admin, 'PATCH', `/${id}`, { studyYear: 2 });

    expect(moved.json()).toMatchObject({ studyYear: 2, status: 'active', endedAt: null });
  });

  it('refuses the same person on the same programme twice', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'twice@example.com');
    await request(admin, 'POST', '', { userId: person.user.id });

    const again = await request(admin, 'POST', '', { userId: person.user.id });

    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('PROGRAM_MEMBERSHIP_EXISTS');
  });

  it('will not admit a stranger to the institution', async () => {
    const admin = await actingAs('institution_admin');
    const stranger = await harness.actingAs({ email: 'stranger2@example.com' });

    const response = await request(admin, 'POST', '', { userId: stranger.user.id });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('PERSON_NOT_IN_INSTITUTION');
  });

  it('erases a membership entered by mistake', async () => {
    const admin = await actingAs('institution_admin');
    const person = await actingAs('registrar', 'mistake@example.com');
    const { id } = (await request(admin, 'POST', '', { userId: person.user.id })).json();

    const removed = await request(admin, 'DELETE', `/${id}`);

    expect(removed.statusCode).toBe(204);
    expect((await request(admin, 'GET')).json()).toEqual([]);
  });

  it('lets a registrar read the roll but not change it', async () => {
    const admin = await actingAs('institution_admin');
    const registrar = await actingAs('registrar', 'reader@example.com');

    expect((await request(registrar, 'GET')).statusCode).toBe(200);

    const denied = await request(registrar, 'POST', '', { userId: admin.user.id });
    expect(denied.statusCode).toBe(403);
  });

  it('keeps the roll from a student, who would read classmates’ addresses off it', async () => {
    const student = await actingAs('student', 'curious@example.com');

    expect((await request(student, 'GET')).statusCode).toBe(403);
  });

  it('404s on a programme that is not this institution’s', async () => {
    const admin = await actingAs('institution_admin');
    const [other] = await harness.db
      .insert(institutions)
      .values({ code: 'stu', name: 'STU' })
      .returning();
    const [theirs] = await harness.db
      .insert(programs)
      .values({ institutionId: other!.id, code: 'INF-BC', name: 'Theirs' })
      .returning();

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/programs/${theirs!.id}/members`,
      headers: admin.headers,
    });

    expect(response.statusCode).toBe(404);
  });

  it('counts an outstanding invitation as the institution knowing somebody', async () => {
    const admin = await actingAs('institution_admin');
    const invited = await harness.actingAs({ email: 'invited@example.com' });

    // Before the invitation they are a stranger.
    const stranger = await request(admin, 'POST', '', { userId: invited.user.id });
    expect(stranger.statusCode).toBe(409);

    await harness.db.insert(invitations).values({
      institutionId,
      address: 'invited@example.com',
      role: 'registrar',
      scopeType: 'institution',
      scopeId: null,
      tokenHash: 'hash-for-the-invitation',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    // "Invite them first" now means something: the invitation alone is enough,
    // which is what makes admitting a whole incoming cohort possible.
    const admitted = await request(admin, 'POST', '', { userId: invited.user.id });
    expect(admitted.statusCode).toBe(201);
  });

  it('does not count an expired or already accepted invitation', async () => {
    const admin = await actingAs('institution_admin');
    const lapsed = await harness.actingAs({ email: 'lapsed@example.com' });

    await harness.db.insert(invitations).values({
      institutionId,
      address: 'lapsed@example.com',
      role: 'registrar',
      scopeType: 'institution',
      scopeId: null,
      tokenHash: 'hash-for-the-lapsed-invitation',
      expiresAt: new Date(Date.now() - 1_000),
    });

    const response = await request(admin, 'POST', '', { userId: lapsed.user.id });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('PERSON_NOT_IN_INSTITUTION');
  });
});
