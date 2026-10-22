import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  DownloadUrlResponseDto,
  RequestUploadTicketDto,
  UploadTicketResponseDto,
} from '../learning/dto/upload-ticket.dto';

import type { DiscussionCaller } from './discussion-access.service';
import { DiscussionModerationService } from './discussion-moderation.service';
import { DiscussionsService } from './discussions.service';
import {
  CreateDiscussionPostDto,
  CreateDiscussionThreadDto,
  DiscussionVisibilityDto,
  EditDiscussionPostDto,
  EditDiscussionThreadDto,
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

  @Post('attachment-tickets')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createDiscussionAttachmentTicket',
    summary: 'Get a URL to upload a file for a post',
    description:
      'At most 10 MiB, of the kinds coursework accepts. Name the returned key in the post.',
  })
  @ApiCreatedResponse({ type: UploadTicketResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async createAttachmentTicket(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestUploadTicketDto,
  ): Promise<UploadTicketResponseDto> {
    return UploadTicketResponseDto.from(
      await this.discussions.attachmentTicket({ institutionId, offeringId, userId }, dto),
    );
  }

  @Get(':threadId/posts/:postId/attachments/:attachmentId/download')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getDiscussionAttachmentDownloadUrl',
    summary: 'A short-lived link to download a file attached to a post',
  })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiErrorResponses({ notFound: true })
  async attachmentDownload(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DownloadUrlResponseDto> {
    return DownloadUrlResponseDto.from(
      await this.discussions.attachmentUrl(
        { institutionId, offeringId, userId },
        threadId,
        postId,
        attachmentId,
      ),
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
      await this.discussions.reply({ institutionId, offeringId, userId }, threadId, dto),
    );
  }

  @Patch(':threadId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'renameDiscussionThread',
    summary: 'Rename a thread you started',
  })
  @ApiOkResponse({ type: DiscussionThreadDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async renameThread(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EditDiscussionThreadDto,
  ): Promise<DiscussionThreadDto> {
    return DiscussionThreadDto.from(
      await this.discussions.renameThread(
        { institutionId, offeringId, userId },
        threadId,
        dto.title,
      ),
    );
  }

  @Patch(':threadId/posts/:postId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'editDiscussionPost',
    summary: 'Edit a post you wrote',
    description:
      'Readers see that the post was edited. A hidden post or a post in a hidden thread is refused.',
  })
  @ApiOkResponse({ type: DiscussionThreadDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async editPost(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EditDiscussionPostDto,
  ): Promise<DiscussionThreadDto> {
    return DiscussionThreadDto.from(
      await this.discussions.editPost(
        { institutionId, offeringId, userId },
        threadId,
        postId,
        dto.body,
      ),
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
