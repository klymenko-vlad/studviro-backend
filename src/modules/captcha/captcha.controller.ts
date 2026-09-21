import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { PublicFormThrottle } from '../../common/throttling';
import { Public } from '../auth/decorators/public.decorator';

import { CaptchaService } from './captcha.service';
import { CaptchaChallengeDto, CaptchaStateDto } from './dto/captcha-challenge.dto';

@ApiTags('auth')
@Controller({ path: 'captcha', version: '1' })
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}

  /**
   * The client asks before rendering a form, so a deployment with the captcha
   * off shows no verification step at all rather than an empty one.
   */
  @Public()
  @Get()
  @ApiOperation({
    operationId: 'getCaptchaState',
    summary: 'Whether this deployment asks the public forms for a captcha',
  })
  @ApiOkResponse({ type: CaptchaStateDto })
  @ApiErrorResponses()
  state(): CaptchaStateDto {
    return { enabled: this.captcha.enabled };
  }

  /**
   * `POST` rather than `GET` because each call mints a new challenge, and a
   * `GET` that is not idempotent is one a proxy will happily cache and serve to
   * two people — who would then hold the same single-use challenge.
   */
  @Public()
  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @PublicFormThrottle()
  @ApiOperation({
    operationId: 'createCaptchaChallenge',
    summary: 'Take a proof-of-work challenge to solve before submitting a public form',
  })
  @ApiOkResponse({ type: CaptchaChallengeDto })
  @ApiErrorResponses()
  challenge(): CaptchaChallengeDto {
    return CaptchaChallengeDto.from(this.captcha.issue());
  }
}
