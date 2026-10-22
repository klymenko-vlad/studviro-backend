import { ApiProperty } from '@nestjs/swagger';

import type { CaptchaChallenge } from '../captcha.types';

export class CaptchaChallengeDto {
  @ApiProperty({ enum: ['SHA-256'], example: 'SHA-256' })
  algorithm!: 'SHA-256';

  @ApiProperty({ description: 'The SHA-256 the client has to find the input of' })
  challenge!: string;

  @ApiProperty({ description: 'Prefixed to the number being searched for. Carries its expiry' })
  salt!: string;

  @ApiProperty({ description: 'The largest number the answer can be' })
  maxnumber!: number;

  @ApiProperty({ description: 'Proves this server issued the challenge' })
  signature!: string;

  static from(challenge: CaptchaChallenge): CaptchaChallengeDto {
    return Object.assign(new CaptchaChallengeDto(), challenge);
  }
}

export class CaptchaStateDto {
  @ApiProperty({ description: 'Whether this deployment asks for a captcha at all' })
  enabled!: boolean;
}
