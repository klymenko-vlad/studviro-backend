import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import type { AuthenticatedUser } from '../auth.constants';
import { CurrentUser } from '../decorators/current-user.decorator';

import { SessionDto } from './dto/session.dto';
import { SessionsService } from './sessions.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller({ path: 'users/me/sessions', version: '1' })
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'The places this account is signed in' })
  @ApiOkResponse({ type: [SessionDto] })
  @ApiErrorResponses()
  listMySessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionDto[]> {
    return this.sessions.list(user);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out every session but this one' })
  @ApiNoContentResponse()
  @ApiErrorResponses()
  revokeMyOtherSessions(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.sessions.revokeOthers(user);
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out one session' })
  @ApiNoContentResponse()
  @ApiErrorResponses()
  revokeMySession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    return this.sessions.revoke(user, sessionId);
  }
}
