import { createHash, randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const GROUP_LENGTH = 5;
export const RECOVERY_CODE_COUNT = 10;

function group(): string {
  return Array.from({ length: GROUP_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    '',
  );
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => `${group()}-${group()}`);
}

export function normaliseRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashRecoveryCode(input: string): string {
  return createHash('sha256').update(normaliseRecoveryCode(input)).digest('hex');
}

export function looksLikeRecoveryCode(input: string): boolean {
  return normaliseRecoveryCode(input).length === GROUP_LENGTH * 2;
}
