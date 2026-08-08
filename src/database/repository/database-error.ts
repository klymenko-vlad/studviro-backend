import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * PostgreSQL error codes worth branching on.
 *
 * `AllExceptionsFilter` already turns these into HTTP responses, so
 * repositories deliberately let driver errors propagate untouched. These
 * helpers exist for the cases where a caller wants to *handle* one — retrying a
 * serialization failure, or converting a unique violation into a domain error
 * with a field-specific message.
 *
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PgErrorCode = {
  UniqueViolation: '23505',
  ForeignKeyViolation: '23503',
  NotNullViolation: '23502',
  CheckViolation: '23514',
  ExclusionViolation: '23P01',
  SerializationFailure: '40001',
  DeadlockDetected: '40P01',
  QueryCanceled: '57014',
  TooManyConnections: '53300',
} as const;

export type PgErrorCode = (typeof PgErrorCode)[keyof typeof PgErrorCode];

/** The subset of a `postgres.js` error we read. */
export interface DriverError extends Error {
  code: string;
  constraint_name?: string;
  table_name?: string;
  column_name?: string;
  detail?: string;
}

/**
 * Digs the driver error out of whatever wraps it.
 *
 * Drizzle raises a `DrizzleQueryError` carrying the real failure as `cause`, so
 * an `instanceof PostgresError` check at the top level silently misses every
 * constraint violation and reports it as a 500. Matching structurally also
 * survives a driver loaded from a second copy of the package.
 */
export function asDriverError(error: unknown): DriverError | undefined {
  let current: unknown = error;

  // Bounded: a cause chain should be two or three links, and a cycle would
  // otherwise spin here forever.
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (typeof (current as { code?: unknown }).code === 'string') return current as DriverError;
    current = current.cause;
  }

  return undefined;
}

export function isDriverError(error: unknown): error is DriverError {
  return asDriverError(error) !== undefined;
}

export function hasErrorCode(error: unknown, ...codes: string[]): boolean {
  const driver = asDriverError(error);

  return driver !== undefined && codes.includes(driver.code);
}

/** True when the write lost a race with a unique or exclusion constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const driver = asDriverError(error);
  if (!driver) return false;

  const codes: string[] = [PgErrorCode.UniqueViolation, PgErrorCode.ExclusionViolation];
  if (!codes.includes(driver.code)) return false;

  return constraint === undefined || driver.constraint_name === constraint;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return hasErrorCode(error, PgErrorCode.ForeignKeyViolation);
}

/**
 * A transient conflict Postgres asks the client to replay, rather than a fault
 * in the statement itself. Safe to retry only if the work is idempotent.
 */
export function isRetryableDatabaseError(error: unknown): boolean {
  return hasErrorCode(error, PgErrorCode.SerializationFailure, PgErrorCode.DeadlockDetected);
}

/**
 * Translates a driver error into the HTTP exception a write should surface.
 * `AllExceptionsFilter` maps these codes too, so this exists to attach the
 * *entity* to the message — "users already exists" beats a generic conflict —
 * and to keep the constraint name out of the response body, where it would
 * leak schema details to a client.
 *
 * Anything unrecognised is returned untouched so genuine faults still reach
 * the filter as a 500 rather than being flattened into a 4xx.
 */
export function toHttpDatabaseError(error: unknown, entityName: string): unknown {
  const driver = asDriverError(error);
  if (!driver) return error;

  switch (driver.code) {
    case PgErrorCode.UniqueViolation:
    case PgErrorCode.ExclusionViolation:
      return new ConflictException({
        code: 'RESOURCE_ALREADY_EXISTS',
        message: `A ${entityName} with these values already exists`,
      });

    case PgErrorCode.ForeignKeyViolation:
      return new BadRequestException({
        code: 'REFERENCED_RESOURCE_MISSING',
        message: 'Referenced resource does not exist',
      });

    case PgErrorCode.NotNullViolation:
      return new BadRequestException({
        code: 'REQUIRED_FIELD_MISSING',
        message: 'A required field was not provided',
      });

    case PgErrorCode.CheckViolation:
      return new BadRequestException({
        code: 'CHECK_CONSTRAINT_VIOLATED',
        message: 'Value violates a constraint on this resource',
      });

    case PgErrorCode.SerializationFailure:
    case PgErrorCode.DeadlockDetected:
      return new ConflictException({
        code: 'CONCURRENT_UPDATE_CONFLICT',
        message: 'Concurrent update conflict — retry the request',
      });

    default:
      return error;
  }
}
