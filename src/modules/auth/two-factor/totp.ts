import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { base32Decode, base32Encode } from './base32';

const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;
const ACCEPTED_DRIFT_STEPS = 1;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

export function stepAt(now: Date): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

export function totpCode(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0xf;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function matchingStep(secret: string, code: string, now: Date): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;

  const current = stepAt(now);
  for (let drift = -ACCEPTED_DRIFT_STEPS; drift <= ACCEPTED_DRIFT_STEPS; drift += 1) {
    const step = current + drift;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step;
  }

  return undefined;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}
