import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { PublicFormThrottle } from '../../../common/throttling';
import { RequireCaptcha } from '../../captcha/decorators/require-captcha.decorator';
import { CaptchaGuard } from '../../captcha/guards/captcha.guard';
import { Public } from '../decorators/public.decorator';

import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { PasswordResetAcceptedDto } from './dto/password-reset-accepted.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { PasswordResetService } from './password-reset.service';

@ApiTags('auth')
@Controller({ path: 'auth/password-reset', version: '1' })
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Public()
  @Post('request')
  @HttpCode(HttpStatus.OK)
  @PublicFormThrottle()
  @UseGuards(CaptchaGuard)
  @RequireCaptcha()
  @ApiOperation({
    operationId: 'requestPasswordReset',
    summary:
      'Ask for a password reset link, answered identically whether or not the address exists',
  })
  @ApiOkResponse({ type: PasswordResetAcceptedDto })
  @ApiErrorResponses()
  async request(@Body() dto: RequestPasswordResetDto): Promise<PasswordResetAcceptedDto> {
    const { devToken } = await this.resets.request(dto.email);

    return devToken ? { devToken } : {};
  }

  @Public()
  @Post(':token/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @PublicFormThrottle()
  @ApiOperation({
    operationId: 'confirmPasswordReset',
    summary: 'Set a new password using a reset token',
  })
  @ApiNoContentResponse({ description: 'The password was reset.' })
  @ApiErrorResponses()
  confirm(@Param('token') token: string, @Body() dto: ConfirmPasswordResetDto): Promise<void> {
    return this.resets.confirm(token, dto.password);
  }
}
