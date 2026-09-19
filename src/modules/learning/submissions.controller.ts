import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { SubmissionResponseDto, SubmitAssignmentDto } from './dto/submission.dto';
import {
  DownloadUrlResponseDto,
  RequestUploadTicketDto,
  UploadTicketResponseDto,
} from './dto/upload-ticket.dto';
import { SubmissionsService } from './submissions.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/assignments/:assignmentId/submissions',
  version: '1',
})
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get('mine')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listMySubmissions',
    summary: 'Every attempt the caller has handed in on this assignment',
  })
  @ApiOkResponse({ type: SubmissionResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async listMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SubmissionResponseDto[]> {
    const entries = await this.submissions.listMine(institutionId, assignmentId, userId);

    return entries.map((entry) => SubmissionResponseDto.from(entry));
  }

  @Post('mine/upload-tickets')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createSubmissionUploadTicket',
    summary: 'Ask for somewhere to PUT a file being handed in',
  })
  @ApiCreatedResponse({ type: UploadTicketResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async createUploadTicket(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestUploadTicketDto,
  ): Promise<UploadTicketResponseDto> {
    return UploadTicketResponseDto.from(
      await this.submissions.createUploadTicket(institutionId, assignmentId, userId, dto),
    );
  }

  @Post('mine')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'submitAssignment',
    summary: 'Hand work in, or hand it in again',
    description:
      'Each call is a new attempt, refused once the attempt limit is reached. Whether the work is late is decided here from the due date and the server’s clock; the client is not asked and is not believed.',
  })
  @ApiCreatedResponse({ type: SubmissionResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async submit(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitAssignmentDto,
  ): Promise<SubmissionResponseDto> {
    return SubmissionResponseDto.from(
      await this.submissions.submit(institutionId, assignmentId, userId, dto),
    );
  }

  @Get()
  @RequirePermission('grade:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listAssignmentSubmissions',
    summary: 'Everything handed in on this assignment, for marking',
    description:
      '`grade:read` is not enough on its own: the caller must teach this offering or administer its offerings.',
  })
  @ApiOkResponse({ type: SubmissionResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SubmissionResponseDto[]> {
    const entries = await this.submissions.listForMarking(institutionId, assignmentId, userId);

    return entries.map((entry) => SubmissionResponseDto.from(entry));
  }

  @Get(':submissionId/files/:fileId/download')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getSubmissionFileDownloadUrl',
    summary: 'A short-lived link to one handed-in file',
    description: 'The student who wrote it, or somebody who may mark it. Nobody else.',
  })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiErrorResponses({ notFound: true })
  async download(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DownloadUrlResponseDto> {
    return DownloadUrlResponseDto.from(
      await this.submissions.downloadUrl(
        institutionId,
        assignmentId,
        submissionId,
        fileId,
        userId,
      ),
    );
  }
}
