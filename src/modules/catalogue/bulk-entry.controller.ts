import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { BulkEntryService } from './bulk-entry.service';
import { BulkImportDto, BulkImportResultDto } from './dto/bulk-entry.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

/**
 * `POST` rather than `PUT` even for a dry run: it is not idempotent in the
 * useful sense, and a preview that changes nothing is still a request the
 * caller makes rather than a resource they read.
 */
@ApiTags('catalogue')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/bulk', version: '1' })
export class BulkEntryController {
  constructor(private readonly bulk: BulkEntryService) {}

  @Post('course-offerings')
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'bulkImportCourseOfferings',
    summary: 'Put a term’s worth of courses on offer at once',
    description:
      'Columns: `courseCode`, `termCode`, and optionally `capacity` and `language`. A row naming a course or term that does not exist fails on its own without stopping the rest.',
  })
  @ApiOkResponse({ type: BulkImportResultDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async offerings(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: BulkImportDto,
  ): Promise<BulkImportResultDto> {
    return BulkImportResultDto.from(
      await this.bulk.importOfferings(institutionId, dto.text, dto.dryRun ?? true),
    );
  }

  @Post('program-members')
  @RequirePermission('program:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'bulkImportProgramMembers',
    summary: 'Admit a cohort to their programmes at once',
    description:
      'Columns: `email`, `programCode`, and optionally `studyYear`. Everybody named must already belong to the institution — an outstanding invitation counts, so the order is invite, then admit.',
  })
  @ApiOkResponse({ type: BulkImportResultDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async members(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: BulkImportDto,
  ): Promise<BulkImportResultDto> {
    return BulkImportResultDto.from(
      await this.bulk.importMembers(institutionId, dto.text, dto.dryRun ?? true),
    );
  }
}
