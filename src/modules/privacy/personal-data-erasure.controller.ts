import { Controller, Delete, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { PersonalDataErasureResponseDto } from './dto/personal-data-erasure.dto';
import { PersonalDataErasureService } from './personal-data-erasure.service';

/**
 * The controller acts, the subject does not (ADR 0030). Erasure is
 * irreversible, it has to be weighed against the retention obligation, and
 * the person asking is not always the person the data is about.
 */
@ApiTags('privacy')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/people/:userId/personal-data', version: '1' })
export class PersonalDataErasureController {
  constructor(private readonly erasure: PersonalDataErasureService) {}

  @Delete()
  @RequirePermission('institution:manage', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'erasePersonalData',
    summary: 'Anonymise a person and keep their academic record',
    description:
      'Irreversible. The account is anonymised, credentials and stored files are destroyed, free text written about the person is cleared, and enrolments, results and registrations stay — pointing at a row that no longer says who they were. Refused while another institution still has an active relationship with them.',
  })
  @ApiOkResponse({ type: PersonalDataErasureResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async erase(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('id') actorUserId: string,
  ): Promise<PersonalDataErasureResponseDto> {
    return PersonalDataErasureResponseDto.from(
      await this.erasure.erase(institutionId, userId, actorUserId),
    );
  }
}
