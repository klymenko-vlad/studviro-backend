import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({
    description: 'A six-digit authenticator code, or a recovery code.',
    minLength: 6,
    maxLength: 32,
    example: '123456',
  })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}
