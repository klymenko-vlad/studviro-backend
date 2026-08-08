import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  refreshToken!: string;
}
