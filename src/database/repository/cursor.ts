import { InvalidInputError } from '../../common/errors/domain.error';

export type CursorValue = string | number | Date;

export interface CursorPayload {
  /** The sort column's value on the last row of the previous page. */
  value: CursorValue;
  /** Tiebreaker, so rows sharing a sort value still have a total order. */
  id: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * The tiebreaker is bound into the query with a `::uuid` cast, so a value that
 * is merely "a string" reaches Postgres and fails there as a 500. Every id
 * column in this schema is a uuid; checking the shape here keeps a malformed
 * cursor a 400, which is what it is.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(payload: CursorPayload): string {
  const value = payload.value instanceof Date ? payload.value.toISOString() : payload.value;

  return Buffer.from(JSON.stringify({ v: value, i: payload.id }), 'utf8').toString('base64url');
}

/**
 * Cursors are opaque to clients but arrive over the wire, so every field is
 * validated before it reaches a query — an unchecked cursor is caller-supplied
 * input reaching the WHERE clause.
 */
export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw malformed();
  }

  const record = parsed as { v?: unknown; i?: unknown };

  if (typeof record.i !== 'string' || !UUID.test(record.i)) throw malformed();
  if (typeof record.v !== 'string' && typeof record.v !== 'number') throw malformed();

  // Timestamps round-trip as ISO strings; hand Postgres a Date so the
  // comparison uses timestamptz semantics rather than lexicographic ordering.
  const value: CursorValue =
    typeof record.v === 'string' && ISO_DATE.test(record.v) ? new Date(record.v) : record.v;

  return { value, id: record.i };
}

function malformed(): InvalidInputError {
  return new InvalidInputError('INVALID_CURSOR', 'The cursor is malformed');
}
