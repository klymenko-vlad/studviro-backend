import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { TeacherProfileResponseDto } from './dto/teacher-profile.dto';
import { TeacherProfileService } from './teacher-profile.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('teachers')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/teachers', version: '1' })
export class TeacherProfileController {
  constructor(private readonly profiles: TeacherProfileService) {}

  @Get(':userId')
  @RequirePermission('course:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getTeacherProfile',
    summary: 'Who a teacher of this institution is and what they teach',
    description:
      'Answers 404 for anybody without a teaching assignment here, so it cannot be used to look up accounts that are not staff.',
  })
  @ApiOkResponse({ type: TeacherProfileResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('id') viewerId: string,
  ): Promise<TeacherProfileResponseDto> {
    return TeacherProfileResponseDto.from(
      await this.profiles.profile(institutionId, userId, viewerId),
    );
  }
}
