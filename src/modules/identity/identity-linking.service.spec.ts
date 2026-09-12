import { describe, expect, it, vi } from 'vitest';

import { ConflictError, UnauthenticatedError } from '../../common/errors/domain.error';
import type { Transaction } from '../../database/database.tokens';
import type { ExternalIdentity, User } from '../../database/schema';
import type { TransactionHost } from '../../database/transaction.host';
import type { UsersRepository } from '../users/users.repository';

import type { ExternalIdentitiesRepository } from './external-identities.repository';
import { IdentityLinkingService, type ProviderIdentity } from './identity-linking.service';
import type { UserEmailsRepository } from './user-emails.repository';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const USER = '44444444-4444-4444-4444-444444444444';

const provider = (overrides: Partial<ProviderIdentity> = {}): ProviderIdentity => ({
  institutionId: INSTITUTION,
  sourceSystem: 'sis',
  issuer: 'https://login.upjs.sk',
  subject: 'subject-123',
  email: 'jana@upjs.sk',
  displayName: 'Jana Nováková',
  ...overrides,
});

const user = (overrides: Partial<User> = {}): User =>
  ({
    id: USER,
    email: 'jana@upjs.sk',
    displayName: 'Jana Nováková',
    status: 'active',
    ...overrides,
  }) as User;

const identity = (overrides: Partial<ExternalIdentity> = {}): ExternalIdentity =>
  ({
    id: 'identity',
    institutionId: INSTITUTION,
    userId: USER,
    ...overrides,
  }) as ExternalIdentity;

function serviceWith(options: {
  storedIdentity?: ExternalIdentity | undefined;
  linkedUser?: User | undefined;
  userWithEmail?: User | undefined;
}) {
  const identities = {
    findBySubject: vi.fn().mockResolvedValue(options.storedIdentity),
    create: vi.fn().mockImplementation((values) => Promise.resolve(identity(values))),
    markAuthenticated: vi.fn().mockResolvedValue(undefined),
  };
  const users = {
    findById: vi.fn().mockResolvedValue(options.linkedUser),
    findByEmail: vi.fn().mockResolvedValue(options.userWithEmail),
    findSignInCandidate: vi.fn().mockResolvedValue(options.userWithEmail),
    create: vi.fn().mockImplementation((values) => Promise.resolve(user(values))),
    update: vi.fn().mockImplementation((_id, values) => Promise.resolve(user(values))),
  };
  const addresses = {
    markVerified: vi.fn().mockResolvedValue(undefined),
    recordAsserted: vi.fn().mockResolvedValue(undefined),
  };
  const txHost = {
    run: vi.fn().mockImplementation((fn: (tx?: Transaction) => unknown) => fn(undefined)),
  };

  return {
    identities,
    users,
    addresses,
    service: new IdentityLinkingService(
      users as unknown as UsersRepository,
      identities as unknown as ExternalIdentitiesRepository,
      addresses as unknown as UserEmailsRepository,
      txHost as unknown as TransactionHost,
    ),
  };
}

describe('IdentityLinkingService', () => {
  it('returns the platform user already linked to the provider subject', async () => {
    const linked = user();
    const { service } = serviceWith({ storedIdentity: identity(), linkedUser: linked });

    await expect(service.resolveUser(provider())).resolves.toEqual(linked);
  });

  it('looks the identity up by institution, issuer and subject', async () => {
    const { service, identities } = serviceWith({
      storedIdentity: identity(),
      linkedUser: user(),
    });

    await service.resolveUser(provider());

    expect(identities.findBySubject).toHaveBeenCalledWith(
      INSTITUTION,
      'https://login.upjs.sk',
      'subject-123',
      undefined,
    );
  });

  it('records the authentication against the identity it matched', async () => {
    const { service, identities } = serviceWith({
      storedIdentity: identity(),
      linkedUser: user(),
    });

    await service.resolveUser(provider());

    expect(identities.markAuthenticated).toHaveBeenCalledWith('identity', undefined);
  });

  it('creates a platform user and an identity when the subject is unknown', async () => {
    const { service, users, identities } = serviceWith({});

    const resolved = await service.resolveUser(provider());

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jana@upjs.sk', displayName: 'Jana Nováková' }),
      undefined,
    );
    expect(identities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: INSTITUTION,
        userId: resolved.id,
        issuer: 'https://login.upjs.sk',
        subject: 'subject-123',
        sourceSystem: 'sis',
      }),
      undefined,
    );
  });

  it('provisions a user with no credential at all', async () => {
    const { service, users } = serviceWith({});

    await service.resolveUser(provider());

    expect(users.create.mock.calls[0]?.[0]).not.toHaveProperty('passwordHash');
  });

  it('activates an invited person record and proves their address', async () => {
    const { service, users, addresses } = serviceWith({
      storedIdentity: identity(),
      linkedUser: user({ status: 'invited' }),
    });

    await service.resolveUser(provider());

    expect(users.update).toHaveBeenCalledWith(USER, { status: 'active' }, undefined);
    expect(addresses.markVerified).toHaveBeenCalledWith(
      USER,
      'jana@upjs.sk',
      INSTITUTION,
      undefined,
    );
  });

  it('refuses to activate an invited record whose address a real account holds', async () => {
    const { service, users } = serviceWith({
      storedIdentity: identity(),
      linkedUser: user({ status: 'invited' }),
      userWithEmail: user({ id: 'someone-else' }),
    });

    await expect(service.resolveUser(provider())).rejects.toBeInstanceOf(ConflictError);
    expect(users.update).not.toHaveBeenCalled();
  });

  it('refuses to adopt an existing account that merely shares the email', async () => {
    const { service, identities } = serviceWith({ userWithEmail: user() });

    await expect(service.resolveUser(provider())).rejects.toBeInstanceOf(ConflictError);
    expect(identities.create).not.toHaveBeenCalled();
  });

  it('refuses an identity whose platform user is gone', async () => {
    const { service } = serviceWith({ storedIdentity: identity(), linkedUser: undefined });

    await expect(service.resolveUser(provider())).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('links a provider subject to a user chosen by the caller, not by email', async () => {
    const { service, identities, users } = serviceWith({});

    await service.link(USER, provider({ externalUsername: 'jnovakova' }));

    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(identities.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, externalUsername: 'jnovakova' }),
      undefined,
    );
  });

  it('rejects a second link for a subject already claimed', async () => {
    const { service } = serviceWith({ storedIdentity: identity({ userId: 'someone-else' }) });

    await expect(service.link(USER, provider())).rejects.toBeInstanceOf(ConflictError);
  });

  it('treats relinking the same subject to the same user as a no-op', async () => {
    const existing = identity();
    const { service, identities } = serviceWith({ storedIdentity: existing });

    await expect(service.link(USER, provider())).resolves.toEqual(existing);
    expect(identities.create).not.toHaveBeenCalled();
  });
});
