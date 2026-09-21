import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

import { CaptchaField } from '../../../captcha/dto/captcha-field.decorator';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email!: string;

  @CaptchaField()
  captcha?: string;
}
