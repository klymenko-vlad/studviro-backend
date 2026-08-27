import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../../authorization/decorators/require-permission.decorator';

import { InstitutionConfigurationResponseDto } from './dto/institution-configuration-response.dto';
import { UpdateInstitutionConfigurationDto } from './dto/update-institution-configuration.dto';
import { InstitutionConfigurationService } from './institution-configuration.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('institution-configuration')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/configuration', version: '1' })
export class InstitutionConfigurationController {
  constructor(private readonly configuration: InstitutionConfigurationService) {}

  @Get()
  @RequirePermission('institution:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getInstitutionConfiguration',
    summary: 'Read an institution’s terminology, locale and feature flags',
  })
  @ApiOkResponse({ type: InstitutionConfigurationResponseDto })
  @ApiErrorResponses({ notFound: true })
  async find(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<InstitutionConfigurationResponseDto> {
    return InstitutionConfigurationResponseDto.fromConfiguration(
      await this.configuration.resolve(institutionId),
    );
  }

  @Patch()
  @RequirePermission('institution:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateInstitutionConfiguration',
    summary: 'Change an institution’s terminology, locale and feature flags',
  })
  @ApiOkResponse({ type: InstitutionConfigurationResponseDto })
  @ApiErrorResponses({ notFound: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: UpdateInstitutionConfigurationDto,
  ): Promise<InstitutionConfigurationResponseDto> {
    return InstitutionConfigurationResponseDto.fromConfiguration(
      await this.configuration.update(institutionId, dto),
    );
  }
}
