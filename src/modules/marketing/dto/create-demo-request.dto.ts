import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { CaptchaField } from '../../captcha/dto/captcha-field.decorator';

const trimmed = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class CreateDemoRequestDto {
  @ApiProperty({ example: 'Comenius University', minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @trimmed()
  institutionName!: string;

  @ApiProperty({ example: 'Ada Lovelace', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @trimmed()
  contactName!: string;

  @ApiProperty({ example: 'ada@university.edu', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({ example: 'Vice-dean for study affairs', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @trimmed()
  role!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @trimmed()
  message?: string;

  /**
   * Honeypot. Declared rather than rejected as an unknown property: the global
   * pipe whitelists, so an undeclared field would 400 and tell a bot exactly
   * where the trap is. A filled one is accepted and silently dropped instead.
   */
  @ApiPropertyOptional({ writeOnly: true, description: 'Leave empty.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @CaptchaField()
  captcha?: string;
}
