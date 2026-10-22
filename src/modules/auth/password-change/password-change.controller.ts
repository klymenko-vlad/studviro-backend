import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { CredentialThrottle } from '../decorators/credential-throttle.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { sessionContextOf } from '../session-context';

import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordChangeService } from './password-change.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller({ path: 'users/me/password', version: '1' })
export class PasswordChangeController {
  constructor(private readonly passwordChange: PasswordChangeService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @CredentialThrottle()
  @ApiOperation({ summary: 'Change the password and sign out every other session' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiErrorResponses()
  changeMyPassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() request: unknown,
  ): Promise<AuthTokensDto> {
    return this.passwordChange.change(userId, dto, sessionContextOf(request));
  }
}
