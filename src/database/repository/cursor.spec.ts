import { describe, expect, it } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import { decodeCursor, encodeCursor } from './cursor';

const ROW_ID = '3f1c2b7e-8a4d-4c19-9e6f-2b5d7a0c4e11';

describe('cursor', () => {
  it('round-trips a timestamp as a Date', () => {
    const value = new Date('2026-08-08T10:20:30.123Z');

    const decoded = decodeCursor(encodeCursor({ value, id: ROW_ID }));

    // Comparing a timestamptz column against a string would fall back to
    // lexicographic ordering, so the Date has to survive the round trip.
    expect(decoded.value).toBeInstanceOf(Date);
    expect((decoded.value as Date).toISOString()).toBe(value.toISOString());
    expect(decoded.id).toBe(ROW_ID);
  });

  it('round-trips numeric sort values without coercing them to a date', () => {
    const decoded = decodeCursor(encodeCursor({ value: 42, id: ROW_ID }));

    expect(decoded.value).toBe(42);
  });

  it('keeps a non-timestamp string a string', () => {
    const decoded = decodeCursor(encodeCursor({ value: 'zebra', id: ROW_ID }));

    expect(decoded.value).toBe('zebra');
  });

  it('is opaque — the payload is not readable as plain text', () => {
    const encoded = encodeCursor({ value: 'zebra', id: ROW_ID });

    expect(encoded).not.toContain('zebra');
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['not base64 at all', '!!!!'],
    ['base64 of non-JSON', Buffer.from('nonsense', 'utf8').toString('base64url')],
    ['JSON without an id', Buffer.from('{"v":"x"}', 'utf8').toString('base64url')],
    [
      'JSON with a non-scalar value',
      Buffer.from(`{"v":{},"i":"${ROW_ID}"}`, 'utf8').toString('base64url'),
    ],
    // The id is bound into the query with a `::uuid` cast, so anything that
    // will not cast has to be rejected here rather than by Postgres — where it
    // would surface as a 500 for what is a malformed request.
    [
      'JSON whose id is not a uuid',
      Buffer.from('{"v":"x","i":"abc"}', 'utf8').toString('base64url'),
    ],
  ])('rejects a %s cursor as invalid input', (_case, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(InvalidInputError);
  });
});
