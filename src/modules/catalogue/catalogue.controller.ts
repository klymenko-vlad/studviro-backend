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

import { CatalogueService } from './catalogue.service';
import {
  CourseResponseDto,
  CreateCourseDto,
  CreateProgramDto,
  ProgramResponseDto,
  UpdateCourseDto,
  UpdateProgramDto,
} from './dto/catalogue.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('catalogue')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId', version: '1' })
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('programs')
  @RequirePermission('program:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listPrograms',
    summary: 'List the institution’s programmes',
  })
  @ApiOkResponse({ type: ProgramResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async findPrograms(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<ProgramResponseDto[]> {
    const programs = await this.catalogue.listPrograms(institutionId);

    return programs.map((program) => ProgramResponseDto.fromEntity(program));
  }

  @Post('programs')
  @RequirePermission('program:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createProgram',
    summary: 'Add a programme the source system does not carry',
    description:
      'The row is platform-authored, so no import will ever match it and reconciliation leaves it alone.',
  })
  @ApiCreatedResponse({ type: ProgramResponseDto })
  @ApiErrorResponses({ conflict: true })
  async createProgram(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: CreateProgramDto,
  ): Promise<ProgramResponseDto> {
    return ProgramResponseDto.fromEntity(
      await this.catalogue.createProgram(institutionId, dto),
    );
  }

  @Patch('programs/:id')
  @RequirePermission('program:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateProgram',
    summary: 'Correct a programme',
    description:
      'Editing a row the source system owns marks it `pending`, so the disagreement is on the record until a run settles it.',
  })
  @ApiOkResponse({ type: ProgramResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async updateProgram(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgramDto,
  ): Promise<ProgramResponseDto> {
    return ProgramResponseDto.fromEntity(
      await this.catalogue.updateProgram(institutionId, id, dto),
    );
  }

  @Delete('programs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('program:manage', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'removeProgram', summary: 'Retire a programme' })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async removeProgram(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.catalogue.removeProgram(institutionId, id);
  }

  @Get('courses')
  @RequirePermission('course:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'listCourses', summary: 'List the institution’s courses' })
  @ApiOkResponse({ type: CourseResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async findCourses(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<CourseResponseDto[]> {
    const courses = await this.catalogue.listCourses(institutionId);

    return courses.map((course) => CourseResponseDto.fromEntity(course));
  }

  @Post('courses')
  @RequirePermission('course:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createCourse',
    summary: 'Add a course the source system does not carry',
  })
  @ApiCreatedResponse({ type: CourseResponseDto })
  @ApiErrorResponses({ conflict: true })
  async createCourse(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: CreateCourseDto,
  ): Promise<CourseResponseDto> {
    return CourseResponseDto.fromEntity(await this.catalogue.createCourse(institutionId, dto));
  }

  @Patch('courses/:id')
  @RequirePermission('course:manage', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'updateCourse', summary: 'Correct a course' })
  @ApiOkResponse({ type: CourseResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async updateCourse(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ): Promise<CourseResponseDto> {
    return CourseResponseDto.fromEntity(
      await this.catalogue.updateCourse(institutionId, id, dto),
    );
  }

  @Delete('courses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('course:manage', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'removeCourse', summary: 'Retire a course' })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async removeCourse(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.catalogue.removeCourse(institutionId, id);
  }
}
