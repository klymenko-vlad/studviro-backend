import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../../authorization/decorators/require-permission.decorator';
import { CONNECTOR_KINDS, type ConnectorKind } from '../connector.types';

import { ConnectorCredentialsService } from './connector-credentials.service';
import { ConnectorCredentialsResponseDto } from './dto/connector-credentials-response.dto';
import { SetConnectorCredentialsDto } from './dto/set-connector-credentials.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('connectors')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/connectors/:kind/credentials', version: '1' })
export class ConnectorCredentialsController {
  constructor(private readonly credentials: ConnectorCredentialsService) {}

  @Get()
  @RequirePermission('connector:configure', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getInstitutionConnectorCredentials',
    summary: 'Report which credential fields a connector needs and which are stored',
  })
  @ApiOkResponse({ type: ConnectorCredentialsResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('kind', new ParseEnumPipe(CONNECTOR_KINDS)) kind: ConnectorKind,
  ): Promise<ConnectorCredentialsResponseDto> {
    const credentials = await this.credentials.describe(institutionId, kind);

    return ConnectorCredentialsResponseDto.fromDomain(credentials);
  }

  @Put()
  @RequirePermission('connector:configure', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'setInstitutionConnectorCredentials',
    summary: 'Store one or more connector credential values, encrypted at rest',
  })
  @ApiOkResponse({ type: ConnectorCredentialsResponseDto })
  @ApiErrorResponses({ notFound: true })
  async set(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('kind', new ParseEnumPipe(CONNECTOR_KINDS)) kind: ConnectorKind,
    @Body() body: SetConnectorCredentialsDto,
  ): Promise<ConnectorCredentialsResponseDto> {
    const credentials = await this.credentials.set(institutionId, kind, body.values);

    return ConnectorCredentialsResponseDto.fromDomain(credentials);
  }

  @Delete(':fieldKey')
  @RequirePermission('connector:configure', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'clearInstitutionConnectorCredential',
    summary: 'Clear one stored connector credential value',
  })
  @ApiOkResponse({ type: ConnectorCredentialsResponseDto })
  @ApiErrorResponses({ notFound: true })
  async clear(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('kind', new ParseEnumPipe(CONNECTOR_KINDS)) kind: ConnectorKind,
    @Param('fieldKey') fieldKey: string,
  ): Promise<ConnectorCredentialsResponseDto> {
    const credentials = await this.credentials.clear(institutionId, kind, fieldKey);

    return ConnectorCredentialsResponseDto.fromDomain(credentials);
  }
}
