import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { InstitutionResponseDto } from './dto/institution-response.dto';
import { InstitutionsService } from './institutions.service';

@ApiTags('institutions')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions', version: '1' })
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listMyInstitutions',
    summary: 'List the institutions the current user belongs to',
  })
  @ApiOkResponse({ type: InstitutionResponseDto, isArray: true })
  @ApiErrorResponses()
  findMine(@CurrentUser('id') userId: string): Promise<InstitutionResponseDto[]> {
    return this.institutions.listForUser(userId);
  }

  @Get(':institutionId')
  @RequirePermission('institution:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({ operationId: 'getInstitution', summary: 'Get an institution' })
  @ApiOkResponse({ type: InstitutionResponseDto })
  @ApiErrorResponses({ notFound: true })
  findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<InstitutionResponseDto> {
    return this.institutions.findOne(institutionId);
  }
}
