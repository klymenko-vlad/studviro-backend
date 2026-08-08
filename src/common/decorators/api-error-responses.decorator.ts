import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../dto/error-response.dto';

/**
 * Documents the failure modes every endpoint shares, so generated clients get a
 * typed `ErrorResponseDto` instead of `unknown` on the error branch.
 *
 * Applied globally in `bootstrap`-adjacent controllers rather than per-route;
 * route-specific statuses (404, 409) are opt-in via the arguments.
 */
export function ApiErrorResponses(options: { notFound?: boolean; conflict?: boolean } = {}) {
  const decorators = [
    ApiBadRequestResponse({
      description: 'Validation failed or the payload was malformed.',
      type: ErrorResponseDto,
    }),
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded.',
      type: ErrorResponseDto,
    }),
    ApiInternalServerErrorResponse({
      description: 'Unhandled server error.',
      type: ErrorResponseDto,
    }),
  ];

  if (options.notFound) {
    decorators.push(ApiNotFoundResponse({ description: 'Not found.', type: ErrorResponseDto }));
  }

  if (options.conflict) {
    decorators.push(
      ApiConflictResponse({
        description: 'Conflicts with an existing record.',
        type: ErrorResponseDto,
      }),
    );
  }

  return applyDecorators(...decorators);
}
