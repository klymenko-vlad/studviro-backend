import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { TwoFactorCodeDto } from './two-factor-code.dto';

export class TwoFactorLoginDto extends TwoFactorCodeDto {
  @ApiProperty({ minLength: 1, maxLength: 256, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  challengeToken!: string;
}
