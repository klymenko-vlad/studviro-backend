import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { institutions, roleAssignments, type CanonicalRole } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Connector credentials (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;

  const memberOf = async (userId: string, role: CanonicalRole): Promise<void> => {
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId,
      role,
      scopeType: 'institution',
      scopeId: null,
    });
  };

  const actingAs = async (role: CanonicalRole) => {
    const actor = await harness.actingAs();
    await memberOf(actor.user.id, role);

    return actor;
  };

  const selectMockSis = async (headers: Record<string, string>): Promise<void> => {
    await harness.inject({
      method: 'PATCH',
      url: `/api/v1/institutions/${institutionId}/configuration`,
      headers,
      payload: { academicSystemConnector: 'mock-sis' },
    });
  };

  const credentialsUrl = (fieldKey?: string): string =>
    `/api/v1/institutions/${institutionId}/connectors/academic/credentials${fieldKey ? `/${fieldKey}` : ''}`;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [created] = await harness.db
      .insert(institutions)
      .values({ code: 'upjs', name: 'UPJŠ' })
      .returning();
    institutionId = created!.id;
  });

  it('reports the declared credential field as not configured before anything is set', async () => {
    const actor = await actingAs('institution_admin');
    await selectMockSis(actor.headers);

    const response = await harness.inject({
      method: 'GET',
      url: credentialsUrl(),
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: 'academic',
      connectorName: 'mock-sis',
      complete: true,
      fields: [
        { key: 'apiToken', secret: true, required: false, configured: false, updatedAt: null },
      ],
    });
  });

  it('fails when no connector is configured for the kind', async () => {
    const actor = await actingAs('institution_admin');

    const response = await harness.inject({
      method: 'GET',
      url: credentialsUrl(),
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(404);
  });

  it('stores a declared field and never echoes its value back', async () => {
    const actor = await actingAs('institution_admin');
    await selectMockSis(actor.headers);

    const response = await harness.inject({
      method: 'PUT',
      url: credentialsUrl(),
      headers: actor.headers,
      payload: { values: { apiToken: 'super-secret-value' } },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain('super-secret-value');
    expect(response.json().fields[0]).toMatchObject({ key: 'apiToken', configured: true });
    expect(response.json().fields[0].updatedAt).not.toBeNull();
  });

  it('rejects a field the connector does not declare', async () => {
    const actor = await actingAs('institution_admin');
    await selectMockSis(actor.headers);

    const response = await harness.inject({
      method: 'PUT',
      url: credentialsUrl(),
      headers: actor.headers,
      payload: { values: { unknownField: 'value' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('UNKNOWN_CREDENTIAL_FIELD');
  });

  it('rejects an empty-string value', async () => {
    const actor = await actingAs('institution_admin');
    await selectMockSis(actor.headers);

    const response = await harness.inject({
      method: 'PUT',
      url: credentialsUrl(),
      headers: actor.headers,
      payload: { values: { apiToken: '' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('EMPTY_CREDENTIAL_VALUE');
  });

  it('clears a stored field', async () => {
    const actor = await actingAs('institution_admin');
    await selectMockSis(actor.headers);
    await harness.inject({
      method: 'PUT',
      url: credentialsUrl(),
      headers: actor.headers,
      payload: { values: { apiToken: 'super-secret-value' } },
    });

    const response = await harness.inject({
      method: 'DELETE',
      url: credentialsUrl('apiToken'),
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().fields[0]).toMatchObject({ key: 'apiToken', configured: false });
  });

  it('fails clearing a field that was never stored', async () => {
    const actor = await actingAs('institution_admin');
    await selectMockSis(actor.headers);

    const response = await harness.inject({
      method: 'DELETE',
      url: credentialsUrl('apiToken'),
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(404);
  });

  it('refuses a member who cannot configure connectors', async () => {
    const actor = await actingAs('student');
    await selectMockSis((await actingAs('institution_admin')).headers);

    const response = await harness.inject({
      method: 'GET',
      url: credentialsUrl(),
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(403);
  });
});
