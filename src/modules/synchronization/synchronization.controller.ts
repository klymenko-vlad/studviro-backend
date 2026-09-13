import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListSyncRunsQueryDto } from './dto/list-sync-runs-query.dto';
import { ReconciliationReportResponseDto } from './dto/reconciliation-report-response.dto';
import { ReconciliationResolutionResponseDto } from './dto/reconciliation-resolution-response.dto';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';
import { StartSyncRunDto } from './dto/start-sync-run.dto';
import { SyncRunDetailResponseDto } from './dto/sync-run-detail-response.dto';
import { SyncRunResponseDto } from './dto/sync-run-response.dto';
import { SyncWatermarkResponseDto } from './dto/sync-watermark-response.dto';
import { ReconciliationResolutionService } from './reconciliation-resolution.service';
import { ReconciliationService } from './reconciliation.service';
import { SynchronizationService } from './synchronization.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('synchronization')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/synchronization', version: '1' })
export class SynchronizationController {
  constructor(
    private readonly synchronization: SynchronizationService,
    private readonly reconciliation: ReconciliationService,
    private readonly resolutions: ReconciliationResolutionService,
  ) {}

  @Post('runs')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('sync:run', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'startSynchronizationRun',
    summary: 'Queue a synchronization run against the institution’s academic connector',
    description:
      'Returns the run already in flight instead of queueing a second one, so a repeated request cannot double-import.',
  })
  @ApiAcceptedResponse({ type: SyncRunResponseDto })
  @ApiErrorResponses({ notFound: true })
  async start(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: StartSyncRunDto,
    @CurrentUser('id') userId: string,
  ): Promise<SyncRunResponseDto> {
    const run = await this.synchronization.request(
      institutionId,
      dto.mode ?? 'incremental',
      userId,
    );

    return SyncRunResponseDto.fromEntity(run);
  }

  @Get('runs')
  @RequirePermission('sync:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listSynchronizationRuns',
    summary: 'List the most recent synchronization runs',
  })
  @ApiOkResponse({ type: SyncRunResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Query() query: ListSyncRunsQueryDto,
  ): Promise<SyncRunResponseDto[]> {
    const runs = await this.synchronization.listRuns(institutionId, query.limit);

    return runs.map((run) => SyncRunResponseDto.fromEntity(run));
  }

  @Get('runs/:runId')
  @RequirePermission('sync:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getSynchronizationRun',
    summary: 'Read one synchronization run and its per-domain results',
  })
  @ApiOkResponse({ type: SyncRunDetailResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<SyncRunDetailResponseDto> {
    return SyncRunDetailResponseDto.fromDetail(
      await this.synchronization.findRun(institutionId, runId),
    );
  }

  @Get('reconciliation')
  @RequirePermission('sync:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getSynchronizationReconciliation',
    summary: 'Compare the source population against the canonical one',
    description:
      'Reads both sides live and reports where they disagree. It resolves nothing and writes nothing.',
  })
  @ApiOkResponse({ type: ReconciliationReportResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findReconciliation(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<ReconciliationReportResponseDto> {
    return ReconciliationReportResponseDto.from(
      await this.reconciliation.report(institutionId),
    );
  }

  @Get('reconciliation/resolutions')
  @RequirePermission('sync:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listReconciliationResolutions',
    summary: 'List the discrepancies somebody has already resolved',
  })
  @ApiOkResponse({ type: ReconciliationResolutionResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async findResolutions(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Query() query: ListSyncRunsQueryDto,
  ): Promise<ReconciliationResolutionResponseDto[]> {
    const resolutions = await this.resolutions.listRecent(institutionId, query.limit);

    return resolutions.map((resolution) =>
      ReconciliationResolutionResponseDto.fromEntity(resolution),
    );
  }

  @Post('reconciliation/resolutions')
  @RequirePermission('sync:run', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'resolveReconciliationDiscrepancy',
    summary: 'Settle one discrepancy by accepting the source or overriding it',
    description:
      'Either yields the platform row to the source, or detaches it so no import matches it again. A record the platform never took in cannot be resolved here — run a full synchronization instead.',
  })
  @ApiCreatedResponse({ type: ReconciliationResolutionResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async resolve(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: ResolveDiscrepancyDto,
    @CurrentUser('id') userId: string,
  ): Promise<ReconciliationResolutionResponseDto> {
    return ReconciliationResolutionResponseDto.fromOutcome(
      await this.resolutions.resolve(institutionId, userId, {
        domain: dto.domain,
        kind: dto.kind,
        action: dto.action,
        canonicalId: dto.canonicalId ?? null,
        externalId: dto.externalId ?? null,
      }),
    );
  }

  @Get('state')
  @RequirePermission('sync:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getSynchronizationState',
    summary: 'Report how fresh each synchronized domain is',
  })
  @ApiOkResponse({ type: SyncWatermarkResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async findState(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<SyncWatermarkResponseDto[]> {
    const watermarks = await this.synchronization.listWatermarks(institutionId);

    return watermarks.map((watermark) => SyncWatermarkResponseDto.fromEntity(watermark));
  }
}
