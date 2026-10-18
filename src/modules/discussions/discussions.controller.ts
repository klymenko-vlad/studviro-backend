import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import type { DiscussionCaller } from './discussion-access.service';
import { DiscussionModerationService } from './discussion-moderation.service';
import { DiscussionsService } from './discussions.service';
import {
  CreateDiscussionPostDto,
  CreateDiscussionThreadDto,
  DiscussionVisibilityDto,
} from './dto/discussion-input.dto';
import { DiscussionThreadDto, DiscussionThreadListDto } from './dto/discussion-response.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/discussion/threads',
  version: '1',
})
export class DiscussionsController {
  constructor(
    private readonly discussions: DiscussionsService,
    private readonly moderation: DiscussionModerationService,
  ) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listDiscussionThreads',
    summary: 'The threads of a course’s discussion, most recently active first',
  })
  @ApiOkResponse({ type: DiscussionThreadListDto })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DiscussionThreadListDto> {
    return DiscussionThreadListDto.from(
      await this.discussions.listThreads({ institutionId, offeringId, userId }),
    );
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'startDiscussionThread', summary: 'Start a thread' })
  @ApiCreatedResponse({ type: DiscussionThreadDto })
  @ApiErrorResponses({ notFound: true })
  async start(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDiscussionThreadDto,
  ): Promise<DiscussionThreadDto> {
    return DiscussionThreadDto.from(
      await this.discussions.startThread({ institutionId, offeringId, userId }, dto),
    );
  }

  @Get(':threadId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'getDiscussionThread', summary: 'A thread with its posts' })
  @ApiOkResponse({ type: DiscussionThreadDto })
  @ApiErrorResponses({ notFound: true })
  async thread(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DiscussionThreadDto> {
    return DiscussionThreadDto.from(
      await this.discussions.thread({ institutionId, offeringId, userId }, threadId),
    );
  }

  @Post(':threadId/posts')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'replyToDiscussionThread', summary: 'Reply in a thread' })
  @ApiCreatedResponse({ type: DiscussionThreadDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async reply(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDiscussionPostDto,
  ): Promise<DiscussionThreadDto> {
    return DiscussionThreadDto.from(
      await this.discussions.reply({ institutionId, offeringId, userId }, threadId, dto.body),
    );
  }

  @Delete(':threadId/posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'deleteDiscussionPost', summary: 'Delete a post you wrote' })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  deletePost(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.discussions.deletePost({ institutionId, offeringId, userId }, threadId, postId);
  }

  @Put(':threadId/visibility')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'setDiscussionThreadVisibility',
    summary: 'Hide a thread from students, or restore it',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  setThreadVisibility(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: DiscussionVisibilityDto,
  ): Promise<void> {
    const caller: DiscussionCaller = { institutionId, offeringId, userId };

    return this.moderation.setThreadHidden(caller, threadId, dto.hidden);
  }

  @Put(':threadId/posts/:postId/visibility')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'setDiscussionPostVisibility',
    summary: 'Hide a post from students, or restore it',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  setPostVisibility(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: DiscussionVisibilityDto,
  ): Promise<void> {
    return this.moderation.setPostHidden(
      { institutionId, offeringId, userId },
      threadId,
      postId,
      dto.hidden,
    );
  }
}
