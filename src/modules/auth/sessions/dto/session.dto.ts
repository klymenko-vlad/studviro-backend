import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { RefreshToken } from '../../../../database/schema';

@Exclude()
export class SessionDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ description: 'The session this request was made from.' })
  current!: boolean;

  @Expose() @ApiPropertyOptional({ type: String, nullable: true }) userAgent!: string | null;
  @Expose() @ApiPropertyOptional({ type: String, nullable: true }) ipAddress!: string | null;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) signedInAt!: Date;

  @Expose()
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When its token last rotated.',
  })
  lastActiveAt!: Date;

  static fromToken(token: RefreshToken, currentSessionId: string | undefined): SessionDto {
    const dto = new SessionDto();

    dto.id = token.sessionId;
    dto.current = token.sessionId === currentSessionId;
    dto.userAgent = token.userAgent;
    dto.ipAddress = token.ipAddress;
    dto.signedInAt = token.sessionStartedAt;
    dto.lastActiveAt = token.createdAt;

    return dto;
  }
}
