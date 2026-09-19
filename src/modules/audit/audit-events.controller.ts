import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { AuditEventsService } from './audit-events.service';
import { AuditEventPageDto, AuditEventResponseDto } from './dto/audit-event-response.dto';
import { ListAuditEventsQueryDto } from './dto/list-audit-events.query.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('audit')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/audit-events', version: '1' })
export class AuditEventsController {
  constructor(private readonly events: AuditEventsService) {}

  @Get()
  @RequirePermission('audit:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listAuditEvents',
    summary: 'Read what was done in an institution, newest first',
    description:
      'Keyset-paginated over `(occurredAt, id)`. Only `institution_admin` holds `audit:read`.',
  })
  @ApiOkResponse({ type: AuditEventPageDto })
  @ApiErrorResponses()
  async findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Query() query: ListAuditEventsQueryDto,
  ): Promise<AuditEventPageDto> {
    const page = await this.events.list(institutionId, query);

    return new AuditEventPageDto(
      page.items.map((event) => AuditEventResponseDto.fromEntity(event)),
      page.meta,
    );
  }
}
