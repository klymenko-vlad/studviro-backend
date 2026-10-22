import { describe, expect, it } from 'vitest';

import { base32Decode, base32Encode } from './base32';
import { generateTotpSecret, matchingStep, otpauthUri, stepAt, totpCode } from './totp';

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('encodes the RFC 4648 vector', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('decodes lowercase input with spaces and padding', () => {
    expect(base32Decode('mzxw 6ytb oi======').toString()).toBe('foobar');
  });

  it('refuses a character outside the alphabet', () => {
    expect(() => base32Decode('MZXW1')).toThrow();
  });
});

describe('totp', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [20000000000, '65353130'],
  ])('matches RFC 6238 at t=%i', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, stepAt(new Date(seconds * 1000)), 8)).toBe(expected);
  });

  it('generates a 160-bit secret', () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });

  it('accepts the current code and one step of drift either way', () => {
    const now = new Date(1_700_000_000_000);
    const step = stepAt(now);

    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step), now)).toBe(step);
    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now)).toBe(step + 1);
  });

  it('refuses a code two steps away, a malformed code and another secret', () => {
    const now = new Date(1_700_000_000_000);
    const step = stepAt(now);

    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now)).toBeUndefined();
    expect(matchingStep(RFC_SECRET, '12345', now)).toBeUndefined();
    expect(matchingStep(RFC_SECRET, 'abcdef', now)).toBeUndefined();
    expect(matchingStep(generateTotpSecret(), totpCode(RFC_SECRET, step), now)).toBeUndefined();
  });

  it('builds an otpauth URI an authenticator app can read', () => {
    const raw = otpauthUri('ABC', 'ada@example.com', 'StudViro');
    const uri = new URL(raw);

    expect(raw.startsWith('otpauth://totp/StudViro%3Aada%40example.com?')).toBe(true);
    expect(uri.searchParams.get('secret')).toBe('ABC');
    expect(uri.searchParams.get('issuer')).toBe('StudViro');
  });
});
