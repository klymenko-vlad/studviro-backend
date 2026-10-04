import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { CredentialThrottle } from '../decorators/credential-throttle.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { CurrentPasswordDto } from '../dto/current-password.dto';

import { RecoveryCodesDto } from './dto/recovery-codes.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorSetupDto } from './dto/two-factor-setup.dto';
import { TwoFactorStatusDto } from './dto/two-factor-status.dto';
import { TwoFactorService } from './two-factor.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller({ path: 'users/me/two-factor', version: '1' })
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get()
  @ApiOperation({ summary: 'Whether two-factor authentication is on' })
  @ApiOkResponse({ type: TwoFactorStatusDto })
  @ApiErrorResponses()
  getMyTwoFactorStatus(@CurrentUser('id') userId: string): Promise<TwoFactorStatusDto> {
    return this.twoFactor.status(userId);
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @CredentialThrottle()
  @ApiOperation({ summary: 'Start pairing an authenticator app' })
  @ApiOkResponse({ type: TwoFactorSetupDto })
  @ApiErrorResponses({ conflict: true })
  beginTwoFactorSetup(
    @CurrentUser('id') userId: string,
    @Body() dto: CurrentPasswordDto,
  ): Promise<TwoFactorSetupDto> {
    return this.twoFactor.beginSetup(userId, dto.currentPassword);
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @CredentialThrottle()
  @ApiOperation({ summary: 'Confirm the pairing with a code and turn two-factor on' })
  @ApiOkResponse({ type: RecoveryCodesDto })
  @ApiErrorResponses({ conflict: true })
  enableTwoFactor(
    @CurrentUser('id') userId: string,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<RecoveryCodesDto> {
    return this.twoFactor.enable(userId, dto.code);
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CredentialThrottle()
  @ApiOperation({ summary: 'Turn two-factor authentication off' })
  @ApiNoContentResponse()
  @ApiErrorResponses()
  disableTwoFactor(
    @CurrentUser('id') userId: string,
    @Body() dto: CurrentPasswordDto,
  ): Promise<void> {
    return this.twoFactor.disable(userId, dto.currentPassword);
  }

  @Post('recovery-codes')
  @HttpCode(HttpStatus.OK)
  @CredentialThrottle()
  @ApiOperation({ summary: 'Replace every recovery code with a new set' })
  @ApiOkResponse({ type: RecoveryCodesDto })
  @ApiErrorResponses({ conflict: true })
  regenerateRecoveryCodes(
    @CurrentUser('id') userId: string,
    @Body() dto: CurrentPasswordDto,
  ): Promise<RecoveryCodesDto> {
    return this.twoFactor.regenerateRecoveryCodes(userId, dto.currentPassword);
  }
}
