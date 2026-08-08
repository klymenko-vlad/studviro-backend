import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, EntityNotFoundError } from '../errors/domain.error';

import { AllExceptionsFilter, type ErrorResponseBody } from './all-exceptions.filter';

/** Mimics the shape postgres.js raises, including Drizzle's wrapping. */
function driverError(code: string, wrapped = false): Error {
  const error = Object.assign(new Error('driver failure'), { code });

  return wrapped ? Object.assign(new Error('Failed query'), { cause: error }) : error;
}

describe('AllExceptionsFilter', () => {
  const reply = vi.fn();
  // Held directly rather than reached through the logger object, so assertions
  // do not detach a method from its receiver.
  const errorLog = vi.fn();
  const debugLog = vi.fn();
  const logger = {
    setContext: vi.fn(),
    error: errorLog,
    debug: debugLog,
  } as unknown as PinoLogger;

  let response: {
    header: ReturnType<typeof vi.fn>;
    sent: boolean;
    raw: { headersSent: boolean };
  };
  let filter: AllExceptionsFilter;

  const host = (): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/users', id: 'req-1' }),
        getResponse: () => response,
      }),
    }) as unknown as ArgumentsHost;

  const captured = (): ErrorResponseBody => reply.mock.calls.at(-1)![1] as ErrorResponseBody;
  const status = (): number => reply.mock.calls.at(-1)![2] as number;

  beforeEach(() => {
    vi.clearAllMocks();
    response = { header: vi.fn(), sent: false, raw: { headersSent: false } };

    filter = new AllExceptionsFilter(
      {
        httpAdapter: {
          reply,
          getRequestUrl: () => '/api/v1/users',
        } as unknown as HttpServer,
      } as HttpAdapterHost,
      logger,
    );
  });

  it('maps a domain not-found to 404 with its own code', () => {
    filter.catch(new EntityNotFoundError('users', 'abc'), host());

    expect(status()).toBe(HttpStatus.NOT_FOUND);
    expect(captured()).toMatchObject({ code: 'USERS_NOT_FOUND', error: 'Not Found' });
  });

  it('carries a domain conflict code and details through to the body', () => {
    filter.catch(new ConflictError('USER_EMAIL_TAKEN', 'taken', { field: 'email' }), host());

    expect(status()).toBe(HttpStatus.CONFLICT);
    expect(captured()).toMatchObject({
      code: 'USER_EMAIL_TAKEN',
      details: { field: 'email' },
    });
  });

  it('preserves an HttpException status and validation messages', () => {
    filter.catch(new BadRequestException(['email must be an email']), host());

    expect(status()).toBe(HttpStatus.BAD_REQUEST);
    expect(captured().message).toEqual(['email must be an email']);
    expect(captured().code).toBe('VALIDATION_FAILED');
  });

  it('honours an explicit code supplied on an HttpException payload', () => {
    filter.catch(new NotFoundException({ code: 'COURSE_MISSING', message: 'gone' }), host());

    expect(captured().code).toBe('COURSE_MISSING');
  });

  it.each([
    ['23505', HttpStatus.CONFLICT, 'RESOURCE_ALREADY_EXISTS'],
    ['23503', HttpStatus.BAD_REQUEST, 'REFERENCED_RESOURCE_MISSING'],
    ['40001', HttpStatus.CONFLICT, 'SERIALIZATION_FAILURE'],
    ['57014', HttpStatus.GATEWAY_TIMEOUT, 'STATEMENT_TIMEOUT'],
    ['53300', HttpStatus.SERVICE_UNAVAILABLE, 'TOO_MANY_CONNECTIONS'],
  ])('maps postgres %s to %i', (code, expected, expectedCode) => {
    filter.catch(driverError(code), host());

    expect(status()).toBe(expected);
    expect(captured().code).toBe(expectedCode);
  });

  it('finds the driver code even when Drizzle has wrapped the error', () => {
    filter.catch(driverError('23505', true), host());

    expect(status()).toBe(HttpStatus.CONFLICT);
  });

  it('reports an unknown failure as a 500 without leaking its message', () => {
    filter.catch(new Error('connection string user=admin password=hunter2'), host());

    expect(status()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(captured())).not.toContain('hunter2');
    expect(captured().message).toBe('Internal server error');
  });

  it('logs 5xx at error level and 4xx at debug', () => {
    filter.catch(new Error('boom'), host());
    expect(errorLog).toHaveBeenCalledTimes(1);

    filter.catch(new NotFoundException(), host());
    expect(debugLog).toHaveBeenCalledTimes(1);
  });

  it('echoes the request id so a bug report can be correlated to a log line', () => {
    filter.catch(new NotFoundException(), host());

    expect(captured().requestId).toBe('req-1');
    expect(response.header).toHaveBeenCalledWith('x-request-id', 'req-1');
  });

  it('does not write a second time when the reply was already flushed', () => {
    response.raw.headersSent = true;

    filter.catch(new Error('after timeout'), host());

    // Writing twice throws inside the filter, and Nest has nowhere to report
    // that — the original error would disappear entirely.
    expect(reply).not.toHaveBeenCalled();
  });
});
