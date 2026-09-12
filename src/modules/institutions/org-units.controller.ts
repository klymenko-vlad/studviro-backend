import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { OrgUnitResponseDto } from './dto/org-unit-response.dto';
import { OrgUnitsService } from './org-units.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('org-units')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/org-units', version: '1' })
export class OrgUnitsController {
  constructor(private readonly orgUnits: OrgUnitsService) {}

  @Get()
  @RequirePermission('role:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listOrgUnits',
    summary: 'List the org units of an institution',
  })
  @ApiOkResponse({ type: OrgUnitResponseDto, isArray: true })
  @ApiErrorResponses()
  findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<OrgUnitResponseDto[]> {
    return this.orgUnits.listForInstitution(institutionId);
  }

  @Get(':id')
  @RequirePermission('role:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'getOrgUnit', summary: 'Get an org unit' })
  @ApiOkResponse({ type: OrgUnitResponseDto })
  @ApiErrorResponses({ notFound: true })
  findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrgUnitResponseDto> {
    return this.orgUnits.findOne(institutionId, id);
  }
}
