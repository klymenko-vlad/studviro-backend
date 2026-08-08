import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Users (e2e)', () => {
  let harness: TestHarness;
  let auth: { authorization: string };

  const validUser = {
    email: 'Ada@Example.com',
    displayName: 'Ada Lovelace',
    password: 'correct horse battery staple',
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    auth = (await harness.actingAs({ role: 'admin' })).headers;
  });

  const post = (payload: Record<string, unknown>) =>
    harness.inject({ method: 'POST', url: '/api/v1/users', payload, headers: auth });

  const list = (query = '') => harness.inject({ url: `/api/v1/users${query}`, headers: auth });

  /** The admin created by `actingAs` is itself a row, so counts start at one. */
  const ACTOR_ROWS = 1;

  it('creates a user, normalising the email and hiding the password hash', async () => {
    const res = await post(validUser);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: 'ada@example.com', displayName: 'Ada Lovelace' });
    expect(res.json()).not.toHaveProperty('passwordHash');
    expect(res.json().id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a duplicate email with 409', async () => {
    await post(validUser);
    const res = await post(validUser);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      statusCode: 409,
      code: 'USER_EMAIL_TAKEN',
      path: '/api/v1/users',
    });
  });

  it('rejects unknown properties (whitelist) and bad payloads with 400', async () => {
    const res = await post({ ...validUser, isAdmin: true });

    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json().message)).toContain('isAdmin');
  });

  it('rejects a short password with 400', async () => {
    const res = await post({ ...validUser, password: 'short' });

    expect(res.statusCode).toBe(400);
  });

  it('paginates the list endpoint', async () => {
    for (let i = 0; i < 5; i++) {
      await post({ ...validUser, email: `user${i}@example.com` });
    }

    const res = await list('?page=1&limit=2');

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(2);
    expect(res.json().meta).toMatchObject({ total: 5 + ACTOR_ROWS, hasNextPage: true });
  });

  it('returns 400 for a malformed uuid and 404 for an unknown one', async () => {
    const malformed = await harness.inject({ url: '/api/v1/users/not-a-uuid', headers: auth });
    const unknown = await harness.inject({
      url: '/api/v1/users/00000000-0000-4000-8000-000000000000',
      headers: auth,
    });

    expect(malformed.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(404);
  });

  it('soft-deletes a user, removing it from the list but keeping the row', async () => {
    const { id } = (await post(validUser)).json();

    const deleted = await harness.inject({
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
      headers: auth,
    });
    expect(deleted.statusCode).toBe(204);

    expect((await list()).json().items).toHaveLength(ACTOR_ROWS);

    const rows = await harness.db.query.users.findMany();
    expect(rows).toHaveLength(1 + ACTOR_ROWS);
    expect(rows.find((row) => row.id === id)?.deletedAt).toBeInstanceOf(Date);
  });

  it('echoes a request id header on every response', async () => {
    const res = await harness.inject({
      url: '/api/v1/users',
      headers: { ...auth, 'x-request-id': 'trace-me' },
    });

    expect(res.headers['x-request-id']).toBe('trace-me');
  });

  describe('authorisation', () => {
    it('rejects an unauthenticated request', async () => {
      const res = await harness.inject({ url: '/api/v1/users' });

      expect(res.statusCode).toBe(401);
    });

    it('rejects an authenticated non-admin', async () => {
      const member = await harness.actingAs({ role: 'user' });

      const res = await harness.inject({ url: '/api/v1/users', headers: member.headers });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'PERMISSION_DENIED' });
    });
  });
});
