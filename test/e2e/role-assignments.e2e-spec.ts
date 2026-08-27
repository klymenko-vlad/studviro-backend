import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { institutions, orgUnits, roleAssignments } from '../../src/database/schema';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

describe('Role assignments (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let facultyId: string;
  let subject: ActingUser;

  const grantInDatabase = async (
    userId: string,
    role: 'institution_admin' | 'registrar' | 'student',
  ): Promise<void> => {
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId,
      role,
      scopeType: 'institution',
      scopeId: null,
    });
  };

  const path = (suffix = ''): string =>
    `/api/v1/institutions/${institutionId}/role-assignments${suffix}`;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    institutionId = only(
      await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' }).returning(),
    ).id;

    facultyId = only(
      await harness.db
        .insert(orgUnits)
        .values({ institutionId, type: 'faculty', code: 'pf', name: 'Faculty of Science' })
        .returning(),
    ).id;

    subject = await harness.actingAs();
  });

  it('rejects an anonymous caller', async () => {
    const response = await harness.inject({ method: 'GET', url: path() });

    expect(response.statusCode).toBe(401);
  });

  it('rejects an authenticated caller holding no role in the institution', async () => {
    const actor = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: path(),
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('rejects a reader when it is asked to grant', async () => {
    const actor = await harness.actingAs();
    await grantInDatabase(actor.user.id, 'registrar');

    const response = await harness.inject({
      method: 'POST',
      url: path(),
      headers: actor.headers,
      payload: { userId: subject.user.id, role: 'teacher', scopeType: 'org_unit' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('lets an institution admin grant a scoped role', async () => {
    const actor = await harness.actingAs();
    await grantInDatabase(actor.user.id, 'institution_admin');

    const response = await harness.inject({
      method: 'POST',
      url: path(),
      headers: actor.headers,
      payload: {
        userId: subject.user.id,
        role: 'teacher',
        scopeType: 'org_unit',
        scopeId: facultyId,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      userId: subject.user.id,
      role: 'teacher',
      scopeType: 'org_unit',
      scopeId: facultyId,
    });
  });

  it('refuses a scope belonging to another institution', async () => {
    const actor = await harness.actingAs();
    await grantInDatabase(actor.user.id, 'institution_admin');

    const other = only(
      await harness.db.insert(institutions).values({ code: 'tuke', name: 'TUKE' }).returning(),
    );
    const foreignUnit = only(
      await harness.db
        .insert(orgUnits)
        .values({ institutionId: other.id, type: 'faculty', code: 'fei', name: 'FEI' })
        .returning(),
    );

    const response = await harness.inject({
      method: 'POST',
      url: path(),
      headers: actor.headers,
      payload: {
        userId: subject.user.id,
        role: 'teacher',
        scopeType: 'org_unit',
        scopeId: foreignUnit.id,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'SCOPE_OUTSIDE_INSTITUTION' });
  });

  it('refuses to grant the same role twice', async () => {
    const actor = await harness.actingAs();
    await grantInDatabase(actor.user.id, 'institution_admin');

    const payload = {
      userId: subject.user.id,
      role: 'teacher',
      scopeType: 'org_unit',
      scopeId: facultyId,
    };

    await harness.inject({ method: 'POST', url: path(), headers: actor.headers, payload });
    const repeated = await harness.inject({
      method: 'POST',
      url: path(),
      headers: actor.headers,
      payload,
    });

    expect(repeated.statusCode).toBe(409);
    expect(repeated.json()).toMatchObject({ code: 'ROLE_ALREADY_ASSIGNED' });
  });

  it('revokes an assignment and stops it counting', async () => {
    const actor = await harness.actingAs();
    await grantInDatabase(actor.user.id, 'institution_admin');

    const created = await harness.inject({
      method: 'POST',
      url: path(),
      headers: actor.headers,
      payload: {
        userId: subject.user.id,
        role: 'teacher',
        scopeType: 'org_unit',
        scopeId: facultyId,
      },
    });
    const { id } = created.json<{ id: string }>();

    const revoked = await harness.inject({
      method: 'DELETE',
      url: path(`/${id}`),
      headers: actor.headers,
    });
    expect(revoked.statusCode).toBe(204);

    const listed = await harness.inject({
      method: 'GET',
      url: path(`?userId=${subject.user.id}`),
      headers: actor.headers,
    });
    expect(listed.json()).toHaveLength(0);
  });

  it('reports a principal own roles across institutions', async () => {
    await grantInDatabase(subject.user.id, 'student');

    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/users/me/roles',
      headers: subject.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { institutionId, role: 'student', scopeType: 'institution' },
    ]);
  });

  it('reports what the caller may do in the institution', async () => {
    await grantInDatabase(subject.user.id, 'institution_admin');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/permissions`,
      headers: subject.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ institutionId, roles: ['institution_admin'] });
    expect(response.json<{ permissions: string[] }>().permissions).toContain('role:assign');
  });

  it('reports a student as unable to assign roles', async () => {
    await grantInDatabase(subject.user.id, 'student');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/permissions`,
      headers: subject.headers,
    });

    expect(response.json<{ permissions: string[] }>().permissions).not.toContain('role:assign');
  });

  it('refuses the permission report to someone outside the institution', async () => {
    const stranger = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/permissions`,
      headers: stranger.headers,
    });

    expect(response.statusCode).toBe(403);
  });

  it('never reports another principal roles as your own', async () => {
    await grantInDatabase(subject.user.id, 'student');
    const stranger = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/users/me/roles',
      headers: stranger.headers,
    });

    expect(response.json()).toHaveLength(0);
  });
});
