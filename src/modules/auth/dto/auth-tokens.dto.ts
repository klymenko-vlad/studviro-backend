import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * Tokens travel in the response body, not in `Set-Cookie`. The browser never
 * sees them: the Next.js BFF is the only client that reads this shape, and it
 * re-issues them as httpOnly cookies on its own origin — which keeps the API
 * free of cross-site cookie and CSRF concerns. See the frontend's
 * `docs/adr/0008-bff-token-cookies.md`.
 */
@Exclude()
export class AuthTokensDto {
  @Expose() @ApiProperty() accessToken!: string;
  @Expose() @ApiProperty() refreshToken!: string;

  @Expose()
  @ApiProperty({ description: 'Access-token lifetime in seconds.', example: 900 })
  expiresIn!: number;

  @Expose() @ApiProperty({ example: 'Bearer' }) tokenType!: string;

  @Expose()
  @Type(() => UserResponseDto)
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  static of(
    accessToken: string,
    refreshToken: string,
    accessExpiresAt: Date,
    user: UserResponseDto,
  ): AuthTokensDto {
    const dto = new AuthTokensDto();

    dto.accessToken = accessToken;
    dto.refreshToken = refreshToken;
    dto.expiresIn = Math.max(0, Math.floor((accessExpiresAt.getTime() - Date.now()) / 1000));
    dto.tokenType = 'Bearer';
    dto.user = user;

    return dto;
  }
}
