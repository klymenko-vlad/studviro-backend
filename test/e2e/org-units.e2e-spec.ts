import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { institutions, orgUnits, roleAssignments } from '../../src/database/schema';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

describe('Org units (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let otherInstitutionId: string;
  let facultyId: string;
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

    facultyId = only(
      await harness.db
        .insert(orgUnits)
        .values({ institutionId, type: 'faculty', code: 'pf', name: 'Faculty of Science' })
        .returning(),
    ).id;

    reader = await harness.actingAs();
    await grantInDatabase(reader.user.id, institutionId);
  });

  it('lists the org units of an institution', async () => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/org-units`,
      headers: reader.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ id: facultyId, code: 'pf' }]);
  });

  it('fetches a single org unit', async () => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/org-units/${facultyId}`,
      headers: reader.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ code: 'pf' });
  });

  it('404s a org unit belonging to another institution', async () => {
    await grantInDatabase(reader.user.id, otherInstitutionId);

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${otherInstitutionId}/org-units/${facultyId}`,
      headers: reader.headers,
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a caller with no role in the institution', async () => {
    const stranger = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/org-units`,
      headers: stranger.headers,
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects an anonymous caller', async () => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/org-units`,
    });

    expect(response.statusCode).toBe(401);
  });
});
