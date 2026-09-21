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
import { AuthService, type SessionContext } from './auth.service';
import { CredentialThrottle } from './decorators/credential-throttle.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

/**
 * Recorded against each refresh token so a user can recognise their own
 * sessions, and so a leaked-token investigation has somewhere to start.
 */
function sessionContextOf(request: unknown): SessionContext {
  const { headers, ip } = request as {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
  };
  const agent = headers?.['user-agent'];

  return {
    userAgent: Array.isArray(agent) ? agent[0] : agent,
    ipAddress: ip,
  };
}
