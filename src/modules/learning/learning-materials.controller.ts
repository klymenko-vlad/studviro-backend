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
  CreateLearningMaterialDto,
  LearningMaterialResponseDto,
  UpdateLearningMaterialDto,
} from './dto/learning-material.dto';
import {
  DownloadUrlResponseDto,
  RequestUploadTicketDto,
  UploadTicketResponseDto,
} from './dto/upload-ticket.dto';
import { LearningMaterialsService } from './learning-materials.service';
import { MaterialOpeningService } from './material-opening.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/materials',
  version: '1',
})
export class LearningMaterialsController {
  constructor(
    private readonly materials: LearningMaterialsService,
    private readonly opening: MaterialOpeningService,
  ) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listLearningMaterials',
    summary: 'The files, links and notes on a course page, in order',
    description:
      'A hidden or ended material is omitted for anybody who cannot unhide it. One that has not opened yet shows only its title, unless it is hidden until then.',
  })
  @ApiOkResponse({ type: LearningMaterialResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<LearningMaterialResponseDto[]> {
    const materials = await this.materials.list(institutionId, spaceId, userId);

    return materials.map((material) => LearningMaterialResponseDto.from(material));
  }

  @Post('upload-tickets')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createMaterialUploadTicket',
    summary: 'Ask for somewhere to PUT a file',
    description:
      'The bytes go straight to the object store, never through this API. PUT them at the returned URL with the returned headers, then create the material with the returned key.',
  })
  @ApiCreatedResponse({ type: UploadTicketResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async createUploadTicket(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestUploadTicketDto,
  ): Promise<UploadTicketResponseDto> {
    return UploadTicketResponseDto.from(
      await this.materials.createUploadTicket(institutionId, spaceId, userId, dto),
    );
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createLearningMaterial',
    summary: 'Add a file, a link or a note to a course page',
  })
  @ApiCreatedResponse({ type: LearningMaterialResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateLearningMaterialDto,
  ): Promise<LearningMaterialResponseDto> {
    return LearningMaterialResponseDto.from(
      await this.materials.create(institutionId, spaceId, userId, dto),
    );
  }

  @Patch(':materialId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateLearningMaterial',
    summary: 'Retitle a material, move it, hide or show it',
  })
  @ApiOkResponse({ type: LearningMaterialResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateLearningMaterialDto,
  ): Promise<LearningMaterialResponseDto> {
    return LearningMaterialResponseDto.from(
      await this.materials.update(institutionId, spaceId, materialId, userId, dto),
    );
  }

  @Delete(':materialId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeLearningMaterial',
    summary: 'Take a material off the page',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.materials.remove(institutionId, spaceId, materialId, userId);
  }

  @Post(':materialId/views')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'recordLearningMaterialView',
    summary: 'Say that the caller opened a material',
    description:
      'Completes a material whose rule is to open it, for a student on the course. Downloading a file records this on its own; call it for a link or a note when the student opens it.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async view(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.opening.view(institutionId, spaceId, materialId, userId);
  }

  @Get(':materialId/download')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getLearningMaterialDownloadUrl',
    summary: 'A short-lived link to the file behind a material',
  })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  @ApiErrorResponses({ notFound: true })
  async download(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DownloadUrlResponseDto> {
    return DownloadUrlResponseDto.from(
      await this.opening.downloadUrl(institutionId, spaceId, materialId, userId),
    );
  }
}
