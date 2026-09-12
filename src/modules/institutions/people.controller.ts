import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { PersonDirectoryEntryDto } from './dto/person-directory-entry.dto';
import { PeopleService } from './people.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('people')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/people', version: '1' })
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @RequirePermission('role:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listPeople',
    summary: 'List the people of an institution with their granted and derived roles',
  })
  @ApiOkResponse({ type: PersonDirectoryEntryDto, isArray: true })
  @ApiErrorResponses()
  findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<PersonDirectoryEntryDto[]> {
    return this.people.listForInstitution(institutionId);
  }
}
