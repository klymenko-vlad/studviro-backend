import { describe, expect, it } from 'vitest';

import { type AppConfigService } from '../../../config/app-config.service';

import { ConnectorCredentialCipherService } from './connector-credential-cipher.service';

function cipherWith(secret: string): ConnectorCredentialCipherService {
  return new ConnectorCredentialCipherService({
    connectorCredentialSecret: secret,
  } as AppConfigService);
}

describe('ConnectorCredentialCipherService', () => {
  const cipher = cipherWith('a'.repeat(32));

  it('decrypts what it encrypted', () => {
    const token = cipher.encrypt('super-secret-value');

    expect(cipher.decrypt(token)).toBe('super-secret-value');
  });

  it('produces a different token for the same plaintext each time', () => {
    const first = cipher.encrypt('same-value');
    const second = cipher.encrypt('same-value');

    expect(first).not.toBe(second);
    expect(cipher.decrypt(first)).toBe('same-value');
    expect(cipher.decrypt(second)).toBe('same-value');
  });

  it('throws when the ciphertext has been tampered with', () => {
    const token = cipher.encrypt('super-secret-value');
    const [version, iv, tag, cipherText] = token.split('.');
    const tampered = [
      version,
      iv,
      tag,
      `${cipherText?.slice(0, -2)}${cipherText?.slice(-2) === 'AA' ? 'BB' : 'AA'}`,
    ].join('.');

    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it('throws when the auth tag has been tampered with', () => {
    const token = cipher.encrypt('super-secret-value');
    const [version, iv, tag, cipherText] = token.split('.');
    const tampered = [
      version,
      iv,
      `${tag?.slice(0, -2)}${tag?.slice(-2) === 'AA' ? 'BB' : 'AA'}`,
      cipherText,
    ].join('.');

    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it('throws on a malformed token', () => {
    expect(() => cipher.decrypt('not-a-real-token')).toThrow();
    expect(() => cipher.decrypt('v1.only.two')).toThrow();
  });

  it('derives different keys from different secrets', () => {
    const other = cipherWith('b'.repeat(32));
    const token = cipher.encrypt('super-secret-value');

    expect(() => other.decrypt(token)).toThrow();
  });
});
