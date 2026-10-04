import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { CurrentPasswordDto } from '../../dto/current-password.dto';

export class ChangePasswordDto extends CurrentPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
