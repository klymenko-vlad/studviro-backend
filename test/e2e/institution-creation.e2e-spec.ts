import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { institutions } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Institution creation (e2e)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  it('lets a platform operator create an institution and grants its first admin', async () => {
    const operator = await harness.actingAs({ role: 'admin' });
    const founder = await harness.actingAs();

    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/institutions',
      headers: operator.headers,
      payload: { code: 'upjs', name: 'UPJŠ', firstAdminUserId: founder.user.id },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ code: 'upjs', name: 'UPJŠ' });

    const listed = await harness.inject({
      method: 'GET',
      url: '/api/v1/institutions',
      headers: founder.headers,
    });

    expect(listed.json()).toMatchObject([{ code: 'upjs' }]);
  });

  it('refuses a non-operator account', async () => {
    const caller = await harness.actingAs();
    const founder = await harness.actingAs();

    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/institutions',
      headers: caller.headers,
      payload: { code: 'upjs', name: 'UPJŠ', firstAdminUserId: founder.user.id },
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects a duplicate institution code', async () => {
    const operator = await harness.actingAs({ role: 'admin' });
    const founder = await harness.actingAs();
    await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' });

    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/institutions',
      headers: operator.headers,
      payload: { code: 'upjs', name: 'Another UPJŠ', firstAdminUserId: founder.user.id },
    });

    expect(response.statusCode).toBe(409);
  });

  it('rejects a first admin that does not exist', async () => {
    const operator = await harness.actingAs({ role: 'admin' });

    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/institutions',
      headers: operator.headers,
      payload: {
        code: 'upjs',
        name: 'UPJŠ',
        firstAdminUserId: '00000000-0000-0000-0000-000000000000',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a malformed code', async () => {
    const operator = await harness.actingAs({ role: 'admin' });
    const founder = await harness.actingAs();

    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/institutions',
      headers: operator.headers,
      payload: { code: 'UPJS Not Ok', name: 'UPJŠ', firstAdminUserId: founder.user.id },
    });

    expect(response.statusCode).toBe(400);
  });
});
