import { describe, expect, it } from 'vitest';

import {
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-codes';

describe('recovery codes', () => {
  it('generates ten distinct codes in two groups of five', () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
  });

  it('leaves out characters that read alike', () => {
    expect(generateRecoveryCodes().join('')).not.toMatch(/[01ilo]/);
  });

  it('hashes a code the same however it is typed', () => {
    expect(hashRecoveryCode('abcde-fghjk')).toBe(hashRecoveryCode(' ABCDE FGHJK '));
    expect(hashRecoveryCode('abcde-fghjk')).not.toBe(hashRecoveryCode('abcde-fghjm'));
  });

  it('tells a recovery code from an authenticator code', () => {
    expect(looksLikeRecoveryCode('abcde-fghjk')).toBe(true);
    expect(looksLikeRecoveryCode('123456')).toBe(false);
  });
});
