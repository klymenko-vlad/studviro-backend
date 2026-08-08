/**
 * Errors the domain raises without knowing who is listening. A repository that
 * throws `NotFoundException` is fine until a queue processor or a CLI command
 * calls the same method — at which point it is throwing HTTP semantics into a
 * context that has no request. `AllExceptionsFilter` is the only place that
 * turns a `kind` into a status code.
 */
export type DomainErrorKind =
  'not_found' | 'conflict' | 'invalid' | 'unauthenticated' | 'forbidden' | 'unavailable';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  /**
   * Stable, machine-readable discriminator. Clients branch on this; `message`
   * is for humans and may be reworded at any time.
   */
  abstract readonly code: string;

  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    // Drops the DomainError constructors from the trace, so the top frame is
    // the code that actually raised it.
    Error.captureStackTrace(this, new.target);
  }
}

export class EntityNotFoundError extends DomainError {
  readonly kind = 'not_found' as const;
  readonly code: string;

  constructor(entity: string, id?: string) {
    super(id ? `${entity} ${id} not found` : `${entity} not found`, id ? { id } : undefined);
    this.code = `${screamingSnake(entity)}_NOT_FOUND`;
  }
}

export class ConflictError extends DomainError {
  readonly kind = 'conflict' as const;

  constructor(
    readonly code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

export class InvalidInputError extends DomainError {
  readonly kind = 'invalid' as const;

  constructor(
    readonly code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

export class UnauthenticatedError extends DomainError {
  readonly kind = 'unauthenticated' as const;

  constructor(
    readonly code = 'UNAUTHENTICATED',
    message = 'Authentication is required',
  ) {
    super(message);
  }
}

export class PermissionDeniedError extends DomainError {
  readonly kind = 'forbidden' as const;

  constructor(
    readonly code = 'PERMISSION_DENIED',
    message = 'You do not have access to this resource',
  ) {
    super(message);
  }
}

export class DependencyUnavailableError extends DomainError {
  readonly kind = 'unavailable' as const;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function screamingSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase()
    .replace(/^_+|_+$/g, '');
}
