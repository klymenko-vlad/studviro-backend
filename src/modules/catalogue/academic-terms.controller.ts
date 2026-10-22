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
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { AcademicTermsService } from './academic-terms.service';
import {
  AcademicTermResponseDto,
  CreateAcademicTermDto,
  UpdateAcademicTermDto,
} from './dto/academic-term.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

/**
 * Writes sit behind `institution:manage` rather than `offering:manage`: the
 * academic calendar is one decision for the whole institution, and a course
 * coordinator holding `offering:manage` over their own courses has no business
 * moving the term every other faculty teaches in.
 */
@ApiTags('catalogue')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/academic-terms', version: '1' })
export class AcademicTermsController {
  constructor(private readonly terms: AcademicTermsService) {}

  @Get()
  @RequirePermission('institution:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listAcademicTerms',
    summary: 'List the institution’s academic terms, newest first',
  })
  @ApiOkResponse({ type: AcademicTermResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<AcademicTermResponseDto[]> {
    const terms = await this.terms.list(institutionId);

    return terms.map((term) => AcademicTermResponseDto.fromEntity(term));
  }

  @Post()
  @RequirePermission('institution:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createAcademicTerm',
    summary: 'Open an academic term',
    description:
      'The enrolment window lives here: until a term carries one, self-service enrolment into its offerings never opens.',
  })
  @ApiCreatedResponse({ type: AcademicTermResponseDto })
  @ApiErrorResponses({ conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: CreateAcademicTermDto,
  ): Promise<AcademicTermResponseDto> {
    return AcademicTermResponseDto.fromEntity(await this.terms.create(institutionId, dto));
  }

  @Patch(':id')
  @RequirePermission('institution:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateAcademicTerm',
    summary: 'Move a term, or change its enrolment window',
  })
  @ApiOkResponse({ type: AcademicTermResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicTermDto,
  ): Promise<AcademicTermResponseDto> {
    return AcademicTermResponseDto.fromEntity(await this.terms.update(institutionId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('institution:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeAcademicTerm',
    summary: 'Retire a term that has no offerings',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.terms.remove(institutionId, id);
  }
}
