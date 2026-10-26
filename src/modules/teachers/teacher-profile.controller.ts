import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListTeacherOfferingsQueryDto } from './dto/list-teacher-offerings.query.dto';
import { TeacherOfferingPageDto } from './dto/teacher-offering.dto';
import { TeacherProfileResponseDto } from './dto/teacher-profile.dto';
import { TeacherOfferingsService } from './teacher-offerings.service';
import { TeacherProfileService } from './teacher-profile.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('teachers')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/teachers', version: '1' })
export class TeacherProfileController {
  constructor(
    private readonly profiles: TeacherProfileService,
    private readonly offerings: TeacherOfferingsService,
  ) {}

  @Get(':userId')
  @RequirePermission('course:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getTeacherProfile',
    summary: 'Who a teacher of this institution is and where they work',
    description:
      'Answers 404 for anybody without a teaching assignment here, so it cannot be used to look up accounts that are not staff.',
  })
  @ApiOkResponse({ type: TeacherProfileResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<TeacherProfileResponseDto> {
    return TeacherProfileResponseDto.from(await this.profiles.profile(institutionId, userId));
  }

  @Get(':userId/offerings')
  @RequirePermission('course:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listTeacherOfferings',
    summary: 'The courses a teacher teaches, newest term first, a page at a time',
  })
  @ApiOkResponse({ type: TeacherOfferingPageDto })
  @ApiErrorResponses({ notFound: true })
  async listOfferings(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListTeacherOfferingsQueryDto,
    @CurrentUser('id') viewerId: string,
  ): Promise<TeacherOfferingPageDto> {
    const page = await this.offerings.list(institutionId, userId, viewerId, query);

    return new TeacherOfferingPageDto(page, query.limit);
  }
}
