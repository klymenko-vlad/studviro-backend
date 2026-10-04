import { describe, expect, it } from 'vitest';

import type { AppConfigService } from '../../../config/app-config.service';

import { SecretCipherService } from './secret-cipher.service';

function cipherWith(secretKey: string): SecretCipherService {
  return new SecretCipherService({
    twoFactor: { secretKey, issuer: 'StudViro' },
  } as AppConfigService);
}

describe('SecretCipherService', () => {
  const cipher = cipherWith('k'.repeat(32));

  it('round-trips a secret without storing it in the clear', () => {
    const sealed = cipher.encrypt('JBSWY3DPEHPK3PXP');

    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(cipher.decrypt(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('seals the same secret differently every time', () => {
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('refuses a ciphertext that was tampered with', () => {
    const [version, iv, tag, body] = cipher.encrypt('JBSWY3DPEHPK3PXP').split('.');
    const flipped = Buffer.from(body ?? '', 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 1;

    expect(() =>
      cipher.decrypt([version, iv, tag, flipped.toString('base64url')].join('.')),
    ).toThrow();
  });

  it('refuses a ciphertext sealed under another key', () => {
    const sealed = cipherWith('o'.repeat(32)).encrypt('JBSWY3DPEHPK3PXP');

    expect(() => cipher.decrypt(sealed)).toThrow();
  });

  it('refuses a malformed value', () => {
    expect(() => cipher.decrypt('plain-text')).toThrow('Unreadable ciphertext');
  });
});
