import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';

import { asDriverError } from '../../database/repository/database-error';
import { DomainError, type DomainErrorKind } from '../errors/domain.error';
import { REQUEST_ID_HEADER } from '../logger/logger.module';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  code: string;
  message: string | string[];
  details?: Record<string, unknown>;
  path: string;
  requestId?: string;
  timestamp: string;
}

const KIND_STATUS: Record<DomainErrorKind, HttpStatus> = {
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  invalid: HttpStatus.BAD_REQUEST,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

const PG_CODE_MAP: Record<string, { status: HttpStatus; code: string; message: string }> = {
  '23505': {
    status: HttpStatus.CONFLICT,
    code: 'RESOURCE_ALREADY_EXISTS',
    message: 'Resource already exists',
  },
  '23503': {
    status: HttpStatus.BAD_REQUEST,
    code: 'REFERENCED_RESOURCE_MISSING',
    message: 'Referenced resource does not exist',
  },
  '23514': {
    status: HttpStatus.BAD_REQUEST,
    code: 'CHECK_CONSTRAINT_VIOLATED',
    message: 'Value violates a constraint on this resource',
  },
  '23502': {
    status: HttpStatus.BAD_REQUEST,
    code: 'REQUIRED_FIELD_MISSING',
    message: 'A required field was not provided',
  },
  // Caller-supplied text that will not cast to the column's type — a hand-made
  // cursor, a malformed id. The fault is in the request, not in the server.
  '22P02': {
    status: HttpStatus.BAD_REQUEST,
    code: 'INVALID_VALUE_FORMAT',
    message: 'A value in the request is not in the expected format',
  },
  '40001': {
    status: HttpStatus.CONFLICT,
    code: 'SERIALIZATION_FAILURE',
    message: 'Concurrent update conflict — retry the request',
  },
  '40P01': {
    status: HttpStatus.CONFLICT,
    code: 'DEADLOCK_DETECTED',
    message: 'Concurrent update conflict — retry the request',
  },
  '57014': {
    status: HttpStatus.GATEWAY_TIMEOUT,
    code: 'STATEMENT_TIMEOUT',
    message: 'The query took too long and was cancelled',
  },
  '53300': {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'TOO_MANY_CONNECTIONS',
    message: 'The database is at capacity',
  },
};

/** 4xx statuses worth seeing at the default log level. */
const SECURITY_RELEVANT: ReadonlySet<number> = new Set<number>([
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.TOO_MANY_REQUESTS,
]);

interface Described {
  status: number;
  error: string;
  code: string;
  message: string | string[];
  details?: Record<string, unknown>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ url?: string; id?: string }>();
    const response = ctx.getResponse<{
      header?: (k: string, v: string) => void;
      sent?: boolean;
      raw?: { headersSent?: boolean };
    }>();

    const { status, error, code, message, details } = this.describe(exception);

    // 401/403/429 are the shape an attack takes, so they must be visible at the
    // default `info` level — a burst of them is the signal an incident starts
    // from. Ordinary client mistakes (400, 404, 409) stay at debug so they do
    // not drown it out.
    const payload = { err: exception, requestId: request.id, code };

    if (status >= 500) {
      this.logger.error(payload, 'unhandled exception');
    } else if (SECURITY_RELEVANT.has(status)) {
      this.logger.warn(payload, 'request rejected');
    } else {
      this.logger.debug(payload, 'request failed');
    }

    // A timeout (or an error thrown from an onSend hook) can leave the reply
    // already flushed. Writing again throws inside the filter, which Nest has
    // nowhere to report — the original error would vanish.
    if (response.sent === true || response.raw?.headersSent === true) {
      return;
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      code,
      message,
      ...(details ? { details } : {}),
      path: (httpAdapter.getRequestUrl(request) as string | undefined) ?? request.url ?? '',
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    response.header?.(REQUEST_ID_HEADER, request.id ?? '');
    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  private describe(exception: unknown): Described {
    if (exception instanceof DomainError) {
      const status = KIND_STATUS[exception.kind];

      return {
        status,
        error: HTTP_REASON[status] ?? 'Error',
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      return this.describeHttp(exception);
    }

    // Drizzle wraps the driver error, so the code has to be dug out of the
    // cause chain — matching on the top-level error misses every constraint
    // violation and reports it as a 500.
    const driver = asDriverError(exception);
    if (driver) {
      const mapped = PG_CODE_MAP[driver.code];

      if (mapped) {
        return {
          status: mapped.status,
          error: HTTP_REASON[mapped.status] ?? 'Error',
          code: mapped.code,
          message: mapped.message,
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }

  private describeHttp(exception: HttpException): Described {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const error = HTTP_REASON[status] ?? exception.name;

    if (typeof payload === 'string') {
      return { status, error, code: defaultCode(status), message: payload };
    }

    const record = payload as {
      message?: string | string[];
      error?: string;
      code?: string;
    };

    return {
      status,
      error: record.error ?? error,
      code: record.code ?? defaultCode(status),
      message: record.message ?? exception.message,
    };
  }
}

const HTTP_REASON: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Payload Too Large',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
  [HttpStatus.REQUEST_TIMEOUT]: 'Request Timeout',
};

const STATUS_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'PERMISSION_DENIED',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.REQUEST_TIMEOUT]: 'REQUEST_TIMEOUT',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

function defaultCode(status: number): string {
  return STATUS_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
}
