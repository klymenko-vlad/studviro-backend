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
  Query,
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
  AddFolderFileDto,
  FolderFilePageResponseDto,
  FolderFileResponseDto,
  ListFolderFilesQueryDto,
} from './dto/folder-file.dto';
import { DownloadUrlResponseDto } from './dto/upload-ticket.dto';
import { FolderFilesService, type FolderFileRef } from './folder-files.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/materials/:materialId/files',
  version: '1',
})
export class FolderFilesController {
  constructor(private readonly folders: FolderFilesService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listFolderFiles',
    summary: 'The files in a folder, a page at a time, by name',
  })
  @ApiOkResponse({ type: FolderFilePageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListFolderFilesQueryDto,
  ): Promise<FolderFilePageResponseDto> {
    const ref: FolderFileRef = { institutionId, spaceId, materialId, userId };

    return FolderFilePageResponseDto.from(await this.folders.list(ref, query));
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'addFolderFile',
    summary: 'Put an uploaded file in a folder',
    description:
      'Upload it first with a material upload ticket; a folder holds up to 100 files.',
  })
  @ApiCreatedResponse({ type: FolderFileResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async add(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddFolderFileDto,
  ): Promise<FolderFileResponseDto> {
    const ref: FolderFileRef = { institutionId, spaceId, materialId, userId };

    return FolderFileResponseDto.from(await this.folders.add(ref, dto));
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'removeFolderFile', summary: 'Take a file out of a folder' })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.folders.remove({ institutionId, spaceId, materialId, userId }, fileId);
  }

  @Get(':fileId/download')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getFolderFileDownloadUrl',
    summary: 'A short-lived link to one file in a folder',
    description: 'Counts as opening the folder for a student on the course.',
  })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiErrorResponses({ notFound: true })
  async download(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DownloadUrlResponseDto> {
    return DownloadUrlResponseDto.from(
      await this.folders.downloadUrl({ institutionId, spaceId, materialId, userId }, fileId),
    );
  }
}
