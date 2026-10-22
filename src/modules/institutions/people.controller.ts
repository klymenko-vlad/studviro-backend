import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListPeopleQueryDto } from './dto/list-people.query.dto';
import { PersonDirectoryPageDto } from './dto/person-directory-entry.dto';
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
    summary: 'A page of the people of an institution, with their granted and derived roles',
    description:
      'Keyset-paginated by name. `q` narrows to a name or an address, so a typeahead asks the server rather than filtering a directory the browser had to download first.',
  })
  @ApiOkResponse({ type: PersonDirectoryPageDto })
  @ApiErrorResponses()
  findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Query() query: ListPeopleQueryDto,
  ): Promise<PersonDirectoryPageDto> {
    return this.people.listForInstitution(institutionId, query);
  }
}
