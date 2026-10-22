import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { PersonalDataExportDto } from './dto/personal-data-export.dto';
import { PersonalDataExportService } from './personal-data-export.service';

/**
 * Self-service by design (ADR 0030): the subject is the only person this
 * route will answer about, and the id comes from the verified token rather
 * than from the path, so `institution:read` cannot be turned into a way of
 * reading somebody else's file.
 */
@ApiTags('privacy')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/personal-data', version: '1' })
export class PersonalDataController {
  constructor(private readonly personalData: PersonalDataExportService) {}

  @Get()
  @RequirePermission('institution:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'exportMyPersonalData',
    summary: 'Take a copy of everything this institution holds about you',
    description:
      'One document covering the account, the sign-in trail, the academic record, the learning record, notifications and the storage keys of your files.',
  })
  @ApiOkResponse({ type: PersonalDataExportDto })
  @ApiErrorResponses()
  async exportMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PersonalDataExportDto> {
    return PersonalDataExportDto.from(await this.personalData.exportFor(institutionId, userId));
  }
}
