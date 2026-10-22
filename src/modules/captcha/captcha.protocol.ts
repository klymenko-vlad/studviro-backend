import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { CaptchaSolution } from './captcha.types';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function signHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/**
 * Compared in constant time. The signature is the only thing standing between a
 * caller and a challenge they minted themselves, and a plain `===` on a hex
 * string leaks how much of a forgery was right.
 */
export function signatureMatches(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false;

  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
}

/** The salt carries its own expiry so the server stores nothing to issue a challenge. */
export function saltWith(random: string, expiresAt: Date): string {
  return `${random}?expires=${Math.floor(expiresAt.getTime() / 1000)}`;
}

export function expiryOf(salt: string): Date | null {
  const expires = new URLSearchParams(salt.split('?')[1] ?? '').get('expires');
  if (expires === null) return null;

  const seconds = Number(expires);

  return Number.isSafeInteger(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

export function decodeSolution(payload: string): CaptchaSolution | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));

    return isSolution(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function isSolution(value: unknown): value is CaptchaSolution {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.algorithm === 'string' &&
    typeof candidate.challenge === 'string' &&
    typeof candidate.salt === 'string' &&
    typeof candidate.signature === 'string' &&
    typeof candidate.number === 'number' &&
    Number.isFinite(candidate.number)
  );
}
