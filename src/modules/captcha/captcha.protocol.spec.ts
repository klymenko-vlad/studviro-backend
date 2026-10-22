import { describe, expect, it } from 'vitest';

import {
  decodeSolution,
  expiryOf,
  saltWith,
  sha256Hex,
  signatureMatches,
  signHex,
} from './captcha.protocol';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');

describe('captcha protocol', () => {
  describe('the salt', () => {
    it('carries the moment it stops being solvable', () => {
      const expires = new Date('2026-09-21T12:00:00.000Z');

      expect(expiryOf(saltWith('abc123', expires))).toEqual(expires);
    });

    it('drops the sub-second part, which the wire format has nowhere to put', () => {
      const salt = saltWith('abc123', new Date('2026-09-21T12:00:00.750Z'));

      expect(expiryOf(salt)).toEqual(new Date('2026-09-21T12:00:00.000Z'));
    });

    it('has no expiry when the query string is missing', () => {
      expect(expiryOf('abc123')).toBeNull();
    });

    it('has no expiry when it is not a number', () => {
      expect(expiryOf('abc123?expires=soon')).toBeNull();
    });

    it('has no expiry when it is the epoch or before it', () => {
      expect(expiryOf('abc123?expires=0')).toBeNull();
      expect(expiryOf('abc123?expires=-5')).toBeNull();
    });
  });

  describe('the signature', () => {
    it('matches the value it was made from', () => {
      const signature = signHex('a-secret-at-least-32-characters-ok', 'challenge');

      expect(signatureMatches(signature, signature)).toBe(true);
    });

    it('does not match one made with a different secret', () => {
      expect(
        signatureMatches(
          signHex('a-secret-at-least-32-characters-ok', 'challenge'),
          signHex('a-different-secret-32-characters!!', 'challenge'),
        ),
      ).toBe(false);
    });

    it('refuses a signature of the wrong length rather than throwing', () => {
      expect(signatureMatches(signHex('secret-secret-secret-secret-1234', 'c'), 'short')).toBe(
        false,
      );
    });
  });

  describe('decoding what the client sends back', () => {
    const solution = {
      algorithm: 'SHA-256',
      challenge: sha256Hex('salt7'),
      salt: 'salt',
      number: 7,
      signature: 'deadbeef',
    };

    it('reads a well-formed payload', () => {
      expect(decodeSolution(encode(solution))).toEqual(solution);
    });

    it('refuses something that is not base64 JSON', () => {
      expect(decodeSolution('not-base64-json')).toBeNull();
    });

    it('refuses JSON that is not an object', () => {
      expect(decodeSolution(encode('a string'))).toBeNull();
      expect(decodeSolution(encode(null))).toBeNull();
      expect(decodeSolution(encode([1, 2, 3]))).toBeNull();
    });

    it('refuses a payload missing a field it needs', () => {
      expect(decodeSolution(encode({ ...solution, signature: undefined }))).toBeNull();
    });

    it('refuses a number sent as a string, which would hash differently', () => {
      expect(decodeSolution(encode({ ...solution, number: '7' }))).toBeNull();
    });

    it('refuses a number that is not finite', () => {
      expect(decodeSolution(encode({ ...solution, number: 'NaN' }))).toBeNull();
    });
  });
});
