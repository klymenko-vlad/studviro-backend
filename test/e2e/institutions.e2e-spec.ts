import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { institutions, roleAssignments, type CanonicalRole } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

describe('Institutions (e2e)', () => {
  let harness: TestHarness;
  let upjsId: string;
  let tukeId: string;

  const memberOf = async (
    userId: string,
    institutionId: string,
    role: CanonicalRole = 'student',
  ): Promise<void> => {
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId,
      role,
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

    upjsId = only(
      await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' }).returning(),
    ).id;
    tukeId = only(
      await harness.db.insert(institutions).values({ code: 'tuke', name: 'TUKE' }).returning(),
    ).id;
  });

  it('lists only the institutions the caller belongs to', async () => {
    const actor = await harness.actingAs();
    await memberOf(actor.user.id, upjsId);

    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/institutions',
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ id: upjsId, code: 'upjs', name: 'UPJŠ' }]);
  });

  it('reports each institution once however many roles the caller holds there', async () => {
    const actor = await harness.actingAs();
    await memberOf(actor.user.id, upjsId, 'student');
    await memberOf(actor.user.id, upjsId, 'teacher');

    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/institutions',
      headers: actor.headers,
    });

    expect(response.json()).toHaveLength(1);
  });

  it('returns an empty list for a caller with no roles anywhere', async () => {
    const actor = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/institutions',
      headers: actor.headers,
    });

    expect(response.json()).toHaveLength(0);
  });

  it('lets a member read the institution it belongs to', async () => {
    const actor = await harness.actingAs();
    await memberOf(actor.user.id, upjsId);

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${upjsId}`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ code: 'upjs' });
  });

  it('refuses to read an institution the caller has no role in', async () => {
    const actor = await harness.actingAs();
    await memberOf(actor.user.id, upjsId);

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${tukeId}`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(403);
  });

  describe('creating an institution with an email-based first admin', () => {
    it('creates an institution_admin invitation instead of a grant', async () => {
      const operator = await harness.actingAs({ role: 'admin' });

      const response = await harness.inject({
        method: 'POST',
        url: '/api/v1/institutions',
        headers: operator.headers,
        payload: { code: 'mtf', name: 'MTF', firstAdminEmail: 'admin@mtf.sk' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ id: string; firstAdminInvitationDevToken: string }>();
      expect(body.firstAdminInvitationDevToken).toMatch(/^[a-f0-9]{64}$/);

      const grants = await harness.db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.institutionId, body.id));
      expect(grants).toHaveLength(0);

      const accept = await harness.inject({
        method: 'POST',
        url: `/api/v1/invitations/${body.firstAdminInvitationDevToken}/accept`,
        payload: { displayName: 'MTF Admin', password: 'correct horse battery staple' },
      });
      expect(accept.statusCode).toBe(204);

      const grantsAfter = await harness.db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.institutionId, body.id));
      expect(grantsAfter).toMatchObject([{ role: 'institution_admin' }]);
    });

    it('rejects naming both a user id and an email', async () => {
      const operator = await harness.actingAs({ role: 'admin' });
      const other = await harness.actingAs();

      const response = await harness.inject({
        method: 'POST',
        url: '/api/v1/institutions',
        headers: operator.headers,
        payload: {
          code: 'both',
          name: 'Both',
          firstAdminUserId: other.user.id,
          firstAdminEmail: 'admin@both.sk',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'FIRST_ADMIN_IDENTIFIER_REQUIRED' });
    });
  });
});
