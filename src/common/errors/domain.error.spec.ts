import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  DependencyUnavailableError,
  DomainError,
  EntityNotFoundError,
  InvalidInputError,
  PermissionDeniedError,
  UnauthenticatedError,
} from './domain.error';

describe('DomainError', () => {
  it('derives a screaming-snake code from the entity name', () => {
    expect(new EntityNotFoundError('users').code).toBe('USERS_NOT_FOUND');
    expect(new EntityNotFoundError('refresh_tokens').code).toBe('REFRESH_TOKENS_NOT_FOUND');
    expect(new EntityNotFoundError('courseEnrolment').code).toBe('COURSE_ENROLMENT_NOT_FOUND');
  });

  it('includes the id in the message and details when given one', () => {
    const error = new EntityNotFoundError('users', 'abc');

    expect(error.message).toBe('users abc not found');
    expect(error.details).toEqual({ id: 'abc' });
  });

  it('omits details entirely when no id is supplied', () => {
    const error = new EntityNotFoundError('users');

    expect(error.message).toBe('users not found');
    expect(error.details).toBeUndefined();
  });

  it.each([
    [new EntityNotFoundError('users', 'x'), 'not_found'],
    [new ConflictError('TAKEN', 'taken'), 'conflict'],
    [new InvalidInputError('BAD', 'bad'), 'invalid'],
    [new UnauthenticatedError(), 'unauthenticated'],
    [new PermissionDeniedError(), 'forbidden'],
    [new DependencyUnavailableError('DOWN', 'down'), 'unavailable'],
  ])('maps %s to the %s kind', (error, kind) => {
    expect(error.kind).toBe(kind);
  });

  it('is catchable as a DomainError and as an Error', () => {
    const error = new ConflictError('USER_EMAIL_TAKEN', 'taken', { field: 'email' });

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConflictError');
    expect(error.details).toEqual({ field: 'email' });
  });

  it('carries a stack that starts at the raising code, not the constructor', () => {
    const error = new EntityNotFoundError('users', 'x');

    expect(error.stack).toBeDefined();
    expect(error.stack).not.toContain('new EntityNotFoundError');
  });
});
