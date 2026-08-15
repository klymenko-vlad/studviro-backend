import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ConnectorStatusService } from './connector-status.service';
import { ConnectorStatusResponseDto } from './dto/connector-status-response.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('connectors')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/connectors', version: '1' })
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorStatusService) {}

  @Get()
  @RequirePermission('institution:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listInstitutionConnectors',
    summary: 'Report the health and capabilities of an institution’s connectors',
  })
  @ApiOkResponse({ type: ConnectorStatusResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<ConnectorStatusResponseDto[]> {
    const statuses = await this.connectors.listForInstitution(institutionId);

    return statuses.map((status) => ConnectorStatusResponseDto.fromStatus(status));
  }
}
