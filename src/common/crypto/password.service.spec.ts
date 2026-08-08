import { beforeAll, describe, expect, it } from 'vitest';

import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const plain = 'correct horse battery staple';
  let digest: string;

  beforeAll(async () => {
    digest = await service.hash(plain);
  });

  it('produces an argon2id digest that does not contain the password', () => {
    expect(digest).toMatch(/^\$argon2id\$/);
    expect(digest).not.toContain(plain);
  });

  it('salts each digest, so the same password hashes differently', async () => {
    expect(await service.hash(plain)).not.toBe(digest);
  });

  it('accepts the original password and rejects anything else', async () => {
    await expect(service.verify(digest, plain)).resolves.toBe(true);
    await expect(service.verify(digest, 'wrong-password')).resolves.toBe(false);
  });

  it('reports a malformed digest as a failed verification, not an exception', async () => {
    // A corrupt row must read as "wrong password". Throwing would turn it into
    // a 500 that confirms to an attacker that the account exists.
    await expect(service.verify('not-a-hash', plain)).resolves.toBe(false);
    await expect(service.verify('', plain)).resolves.toBe(false);
  });

  it('does not ask for a rehash of a digest it just produced', () => {
    expect(service.needsRehash(digest)).toBe(false);
  });

  it('asks for a rehash of an unparseable digest', () => {
    expect(service.needsRehash('not-a-hash')).toBe(true);
  });
});
