import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { externalIdentities, institutions, userEmails, users } from '../../src/database/schema';
import {
  IdentityLinkingService,
  type ProviderIdentity,
} from '../../src/modules/identity/identity-linking.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

describe('Identity linking (e2e)', () => {
  let harness: TestHarness;
  let linking: IdentityLinkingService;
  let institutionId: string;

  const provider = (overrides: Partial<ProviderIdentity> = {}): ProviderIdentity => ({
    institutionId,
    issuer: 'https://login.upjs.sk',
    subject: 'subject-123',
    email: 'jana@upjs.sk',
    displayName: 'Jana Nováková',
    ...overrides,
  });

  beforeAll(async () => {
    harness = await createTestHarness();
    linking = harness.app.get(IdentityLinkingService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    institutionId = only(
      await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' }).returning(),
    ).id;
  });

  it('provisions a user the first time a subject authenticates', async () => {
    const user = await linking.resolveUser(provider());

    const [stored] = await harness.db
      .select()
      .from(externalIdentities)
      .where(eq(externalIdentities.userId, user.id));

    expect(stored).toMatchObject({
      institutionId,
      subject: 'subject-123',
    });
  });

  it('returns the same user on every later authentication', async () => {
    const first = await linking.resolveUser(provider());
    const second = await linking.resolveUser(provider());

    expect(second.id).toBe(first.id);
    expect(await harness.db.select().from(users)).toHaveLength(1);
  });

  it('keeps two institutions using the same subject apart', async () => {
    const other = only(
      await harness.db.insert(institutions).values({ code: 'tuke', name: 'TUKE' }).returning(),
    );

    const first = await linking.resolveUser(provider());
    const second = await linking.resolveUser(
      provider({ institutionId: other.id, email: 'jana@tuke.sk' }),
    );

    expect(second.id).not.toBe(first.id);
  });

  it('refuses to adopt a local account that shares the email address', async () => {
    await harness.actingAs({ email: 'jana@upjs.sk' });

    await expect(linking.resolveUser(provider())).rejects.toMatchObject({
      code: 'IDENTITY_EMAIL_CONFLICT',
    });
  });

  it('links a subject to an account the caller names', async () => {
    const actor = await harness.actingAs({ email: 'jana@upjs.sk' });

    const linked = await linking.link(actor.user.id, provider());

    expect(linked.userId).toBe(actor.user.id);
  });

  it('refuses to move a linked subject to a second account', async () => {
    const first = await linking.resolveUser(provider());
    const other = await harness.actingAs();

    await expect(linking.link(other.user.id, provider())).rejects.toMatchObject({
      code: 'IDENTITY_ALREADY_LINKED',
    });
    expect(first.id).not.toBe(other.user.id);
  });

  it('reports the linked accounts of the current user', async () => {
    const actor = await harness.actingAs({ email: 'jana@upjs.sk' });
    await linking.link(actor.user.id, provider({ externalUsername: 'jnovakova' }));

    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/users/me/identities',
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ institutionId, externalUsername: 'jnovakova' }]);
  });

  it('never reports another account linked identities', async () => {
    const owner = await harness.actingAs({ email: 'jana@upjs.sk' });
    await linking.link(owner.user.id, provider());
    const stranger = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/users/me/identities',
      headers: stranger.headers,
    });

    expect(response.json()).toHaveLength(0);
  });

  it('activates an invited person record the first time they authenticate', async () => {
    const [invited] = await harness.db
      .insert(users)
      .values({ email: 'jana@upjs.sk', displayName: 'Jana Nováková', status: 'invited' })
      .returning();

    await harness.db.insert(externalIdentities).values({
      institutionId,
      userId: invited!.id,
      issuer: 'https://login.upjs.sk',
      subject: 'subject-123',
      assertedEmail: 'jana@upjs.sk',
    });

    const user = await linking.resolveUser(provider());

    expect(user.id).toBe(invited!.id);
    expect(user.status).toBe('active');

    const [address] = await harness.db
      .select()
      .from(userEmails)
      .where(eq(userEmails.userId, invited!.id));

    expect(address!.verifiedAt).toBeInstanceOf(Date);
  });

  it('leaves no user behind when linking fails', async () => {
    await harness.actingAs({ email: 'jana@upjs.sk' });

    await expect(linking.resolveUser(provider())).rejects.toThrow();
    expect(await harness.db.select().from(users)).toHaveLength(1);
  });
});
