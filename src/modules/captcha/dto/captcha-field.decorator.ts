import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so a body carrying an
 * undeclared `captcha` is rejected as malformed before `CaptchaGuard`'s answer
 * can matter. Every form the guard protects declares the field.
 *
 * Optional here and required by the guard, deliberately: a deployment with the
 * captcha off should not make the field mandatory, and "you did not solve the
 * challenge" is a clearer answer than a validation error on a field the caller
 * has never heard of.
 */
const MAX_SOLUTION_LENGTH = 4_096;

export const CaptchaField = (): PropertyDecorator =>
  applyDecorators(
    ApiPropertyOptional({
      description:
        'A solved captcha challenge, base64. Required when `GET /captcha` reports the captcha enabled.',
    }),
    IsOptional(),
    IsString(),
    MaxLength(MAX_SOLUTION_LENGTH),
  );
