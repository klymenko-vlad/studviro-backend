import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { CourseOfferingService } from './course-offering.service';
import { CourseOfferingResponseDto } from './dto/course-offering-response.dto';

@ApiTags('courses')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/course-offerings', version: '1' })
export class CourseOfferingController {
  constructor(private readonly offerings: CourseOfferingService) {}

  @Get(':offeringId')
  @RequirePermission('offering:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'getCourseOffering',
    summary: 'Read one course offering the caller takes, teaches or administers',
  })
  @ApiOkResponse({ type: CourseOfferingResponseDto })
  @ApiErrorResponses()
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @CurrentUser('id') userId: string,
  ): Promise<CourseOfferingResponseDto> {
    return CourseOfferingResponseDto.fromDetail(
      await this.offerings.findForViewer(institutionId, offeringId, userId),
    );
  }
}
