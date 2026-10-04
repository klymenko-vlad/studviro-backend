import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequireCaptcha } from '../captcha/decorators/require-captcha.decorator';
import { CaptchaGuard } from '../captcha/guards/captcha.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';

import type { AuthenticatedUser } from './auth.constants';
import { AuthService } from './auth.service';
import { CredentialThrottle } from './decorators/credential-throttle.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { sessionContextOf } from './session-context';
import { TwoFactorLoginDto } from './two-factor/dto/two-factor-login.dto';
import { TwoFactorLoginService } from './two-factor/two-factor-login.service';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly twoFactorLogin: TwoFactorLoginService,
  ) {}

  @Public()
  @Post('register')
  @CredentialThrottle()
  @UseGuards(CaptchaGuard)
  @RequireCaptcha()
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @ApiErrorResponses({ conflict: true })
  register(@Body() dto: CreateUserDto, @Req() request: unknown): Promise<AuthTokensDto> {
    return this.auth.register(dto, sessionContextOf(request));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @CredentialThrottle()
  @UseGuards(CaptchaGuard)
  @RequireCaptcha()
  @ApiOperation({ summary: 'Exchange credentials for tokens' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiErrorResponses()
  login(@Body() dto: LoginDto, @Req() request: unknown): Promise<AuthTokensDto> {
    return this.auth.login(dto, sessionContextOf(request));
  }

  @Public()
  @Post('login/two-factor')
  @HttpCode(HttpStatus.OK)
  @CredentialThrottle()
  @ApiOperation({ summary: 'Finish a sign-in with an authenticator or recovery code' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiErrorResponses()
  completeTwoFactorLogin(
    @Body() dto: TwoFactorLoginDto,
    @Req() request: unknown,
  ): Promise<AuthTokensDto> {
    return this.twoFactorLogin.complete(dto, sessionContextOf(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @CredentialThrottle()
  @ApiOperation({ summary: 'Rotate a refresh token for a new pair' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiErrorResponses()
  refresh(@Body() dto: RefreshTokenDto, @Req() request: unknown): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken, sessionContextOf(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a single refresh token' })
  @ApiNoContentResponse()
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  @ApiNoContentResponse()
  logoutAll(@CurrentUser('id') userId: string): Promise<void> {
    return this.auth.logoutAll(userId);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'The currently authenticated user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiErrorResponses()
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.auth.me(user);
  }
}
