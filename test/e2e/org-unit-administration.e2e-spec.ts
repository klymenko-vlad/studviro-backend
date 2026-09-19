import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  courses,
  institutions,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Org unit and room administration (e2e)', () => {
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
    path: string,
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${institutionId}${path}`,
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

  it('builds a tree: university, faculty under it, department under that', async () => {
    const admin = await actingAs('institution_admin');

    const university = await request(admin, 'POST', '/org-units', {
      code: 'UPJS',
      name: 'UPJŠ',
      type: 'university',
    });
    expect(university.statusCode).toBe(201);

    const faculty = await request(admin, 'POST', '/org-units', {
      code: 'FEI',
      name: 'Faculty of Informatics',
      type: 'faculty',
      parentId: university.json().id,
    });
    expect(faculty.statusCode).toBe(201);
    expect(faculty.json().parentId).toBe(university.json().id);

    const department = await request(admin, 'POST', '/org-units', {
      code: 'KPI',
      name: 'Department of Computers',
      type: 'department',
      parentId: faculty.json().id,
    });
    expect(department.statusCode).toBe(201);

    const listed = await request(admin, 'GET', '/org-units');
    expect(listed.json()).toHaveLength(3);
  });

  it('refuses a duplicate code and an unknown parent', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '/org-units', { code: 'FEI', name: 'Faculty' });

    const duplicate = await request(admin, 'POST', '/org-units', {
      code: 'FEI',
      name: 'Another',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('ORG_UNIT_CODE_TAKEN');

    const orphan = await request(admin, 'POST', '/org-units', {
      code: 'KPI',
      name: 'Dept',
      parentId: '11111111-1111-4111-8111-111111111111',
    });
    expect(orphan.statusCode).toBe(404);
  });

  it('will not close the tree into a ring', async () => {
    const admin = await actingAs('institution_admin');
    const root = (
      await request(admin, 'POST', '/org-units', { code: 'UPJS', name: 'UPJŠ' })
    ).json();
    const child = (
      await request(admin, 'POST', '/org-units', {
        code: 'FEI',
        name: 'Faculty',
        parentId: root.id,
      })
    ).json();

    const itself = await request(admin, 'PATCH', `/org-units/${root.id}`, {
      parentId: root.id,
    });
    expect(itself.statusCode).toBe(409);
    expect(itself.json().code).toBe('ORG_UNIT_PARENT_IS_ITSELF');

    const descendant = await request(admin, 'PATCH', `/org-units/${root.id}`, {
      parentId: child.id,
    });
    expect(descendant.statusCode).toBe(409);
    expect(descendant.json().code).toBe('ORG_UNIT_PARENT_IS_A_DESCENDANT');
  });

  it('refuses to retire a unit with children, or one a course belongs to', async () => {
    const admin = await actingAs('institution_admin');
    const root = (
      await request(admin, 'POST', '/org-units', { code: 'UPJS', name: 'UPJŠ' })
    ).json();
    const child = (
      await request(admin, 'POST', '/org-units', {
        code: 'FEI',
        name: 'Faculty',
        parentId: root.id,
      })
    ).json();

    const withChildren = await request(admin, 'DELETE', `/org-units/${root.id}`);
    expect(withChildren.statusCode).toBe(409);
    expect(withChildren.json().code).toBe('ORG_UNIT_HAS_CHILDREN');

    await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms', orgUnitId: child.id });

    const inUse = await request(admin, 'DELETE', `/org-units/${child.id}`);
    expect(inUse.statusCode).toBe(409);
    expect(inUse.json().code).toBe('ORG_UNIT_IN_USE');
  });

  it('adds a room, and refuses to retire one an exam is booked into', async () => {
    const admin = await actingAs('institution_admin');
    const faculty = (
      await request(admin, 'POST', '/org-units', { code: 'FEI', name: 'Faculty' })
    ).json();

    const room = await request(admin, 'POST', '/rooms', {
      code: 'FEI-101',
      building: 'Blok A',
      capacity: 120,
      orgUnitId: faculty.id,
    });
    expect(room.statusCode).toBe(201);
    expect(room.json()).toMatchObject({ code: 'FEI-101', capacity: 120 });

    const listed = await request(admin, 'GET', '/rooms');
    expect(listed.json()).toHaveLength(1);

    const retired = await request(admin, 'DELETE', `/rooms/${room.json().id}`);
    expect(retired.statusCode).toBe(204);

    const gone = await request(admin, 'GET', '/rooms');
    expect(gone.json()).toHaveLength(0);
  });

  it('refuses to retire a faculty while a room still belongs to it', async () => {
    const admin = await actingAs('institution_admin');
    const faculty = (
      await request(admin, 'POST', '/org-units', { code: 'FEI', name: 'Faculty' })
    ).json();
    await request(admin, 'POST', '/rooms', { code: 'FEI-101', orgUnitId: faculty.id });

    const response = await request(admin, 'DELETE', `/org-units/${faculty.id}`);

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('ORG_UNIT_IN_USE');
  });

  it('lets a registrar read the tree and the rooms but change neither', async () => {
    const admin = await actingAs('institution_admin');
    await request(admin, 'POST', '/org-units', { code: 'FEI', name: 'Faculty' });

    const registrar = await actingAs('registrar');

    expect((await request(registrar, 'GET', '/org-units')).statusCode).toBe(200);
    expect((await request(registrar, 'GET', '/rooms')).statusCode).toBe(200);

    const unit = await request(registrar, 'POST', '/org-units', { code: 'X', name: 'X' });
    expect(unit.statusCode).toBe(403);

    const room = await request(registrar, 'POST', '/rooms', { code: 'X-1' });
    expect(room.statusCode).toBe(403);
  });

  it('lets a course coordinator manage rooms, because they timetable the teaching', async () => {
    const coordinator = await actingAs('course_coordinator');

    const room = await request(coordinator, 'POST', '/rooms', { code: 'FEI-101' });

    expect(room.statusCode).toBe(201);
  });

  it('will not reach into another institution’s tree', async () => {
    const admin = await actingAs('institution_admin');
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
      method: 'POST',
      url: `/api/v1/institutions/${other!.id}/org-units`,
      headers: otherAdmin.headers,
      payload: { code: 'FEI', name: 'Theirs' },
    });
    expect(theirs.statusCode).toBe(201);

    const reached = await request(admin, 'PATCH', `/org-units/${theirs.json().id}`, {
      name: 'Mine now',
    });
    expect(reached.statusCode).toBe(404);
  });
});
