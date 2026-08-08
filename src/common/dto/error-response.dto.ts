import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The single error shape every endpoint returns, produced by
 * `AllExceptionsFilter`. Documenting it here gives generated clients one
 * `ErrorResponseDto` to narrow to, instead of a different ad-hoc object per
 * status code.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  /** A single message, or one entry per failed validation constraint. */
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['email must be an email'],
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/v1/users' })
  path!: string;

  /** Echoed back in the `x-request-id` header — quote it in bug reports. */
  @ApiPropertyOptional({ example: '3f6c1e2a-...' })
  requestId?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp!: string;
}
