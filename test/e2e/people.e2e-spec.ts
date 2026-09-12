import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  institutions,
  programMemberships,
  programs,
  roleAssignments,
} from '../../src/database/schema';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

describe('People directory (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let otherInstitutionId: string;
  let programId: string;
  let reader: ActingUser;

  const grantInDatabase = async (userId: string, institution: string): Promise<void> => {
    await harness.db.insert(roleAssignments).values({
      institutionId: institution,
      userId,
      role: 'registrar',
      scopeType: 'institution',
      scopeId: null,
    });
  };

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
    otherInstitutionId = only(
      await harness.db.insert(institutions).values({ code: 'tuke', name: 'TUKE' }).returning(),
    ).id;
    programId = only(
      await harness.db
        .insert(programs)
        .values({ institutionId, code: 'inf', name: 'Informatics' })
        .returning(),
    ).id;

    reader = await harness.actingAs();
    await grantInDatabase(reader.user.id, institutionId);
  });

  it('lists a person with a granted role', async () => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/people`,
      headers: reader.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { userId: reader.user.id, roles: [{ role: 'registrar', source: 'granted' }] },
    ]);
  });

  it('lists a person whose only role is derived from an active program membership', async () => {
    const student = await harness.actingAs();
    await harness.db.insert(programMemberships).values({
      institutionId,
      programId,
      userId: student.user.id,
      status: 'active',
    });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/people`,
      headers: reader.headers,
    });

    const entries: { userId: string }[] = response.json();
    const found = entries.find((entry) => entry.userId === student.user.id);

    expect(found).toMatchObject({ roles: [{ role: 'student', source: 'derived' }] });
  });

  it('omits a person whose program membership is interrupted', async () => {
    const leaver = await harness.actingAs();
    await harness.db.insert(programMemberships).values({
      institutionId,
      programId,
      userId: leaver.user.id,
      status: 'interrupted',
    });

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/people`,
      headers: reader.headers,
    });

    const entries: { userId: string }[] = response.json();
    expect(entries.some((entry) => entry.userId === leaver.user.id)).toBe(false);
  });

  it('never lists a person from another institution', async () => {
    const other = await harness.actingAs();
    await grantInDatabase(other.user.id, otherInstitutionId);

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/people`,
      headers: reader.headers,
    });

    const entries: { userId: string }[] = response.json();
    expect(entries.some((entry) => entry.userId === other.user.id)).toBe(false);
  });

  it('rejects a caller with no role in the institution', async () => {
    const stranger = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/people`,
      headers: stranger.headers,
    });

    expect(response.statusCode).toBe(403);
  });
});
