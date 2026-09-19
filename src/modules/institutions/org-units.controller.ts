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

import { OrgUnitResponseDto } from './dto/org-unit-response.dto';
import { CreateOrgUnitDto, UpdateOrgUnitDto } from './dto/org-unit.dto';
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

  @Post()
  @RequirePermission('institution:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createOrgUnit',
    summary: 'Add a faculty, department or institute',
    description:
      'Leave `parentId` null for a root unit — the university itself. Everything else hangs off the tree this builds.',
  })
  @ApiCreatedResponse({ type: OrgUnitResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: CreateOrgUnitDto,
  ): Promise<OrgUnitResponseDto> {
    return this.orgUnits.create(institutionId, dto);
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

  @Patch(':id')
  @RequirePermission('institution:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateOrgUnit',
    summary: 'Rename an org unit, or move it in the tree',
  })
  @ApiOkResponse({ type: OrgUnitResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgUnitDto,
  ): Promise<OrgUnitResponseDto> {
    return this.orgUnits.update(institutionId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('institution:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeOrgUnit',
    summary: 'Retire an org unit nothing hangs off',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.orgUnits.remove(institutionId, id);
  }
}
