import { describe, expect, it } from 'vitest';

import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it('maps the loopback keyword through unchanged', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback');
  });

  it('maps the boolean keywords', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('returns a single hop as a string, not a one-element array', () => {
    expect(parseTrustProxy('10.0.0.1')).toBe('10.0.0.1');
  });

  it('splits and trims a comma-separated CIDR list', () => {
    expect(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12')).toEqual([
      '10.0.0.0/8',
      '172.16.0.0/12',
    ]);
  });

  it('drops empty entries left by a trailing comma', () => {
    expect(parseTrustProxy('10.0.0.0/8,')).toBe('10.0.0.0/8');
  });

  it('yields an empty list for an empty value, trusting nothing', () => {
    expect(parseTrustProxy('')).toEqual([]);
  });
});
