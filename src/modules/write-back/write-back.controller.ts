import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListWriteIntentsQueryDto } from './dto/list-write-intents-query.dto';
import { WriteIntentResponseDto } from './dto/write-intent-response.dto';
import { WriteIntentAdminService } from './write-intent-admin.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('synchronization')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/synchronization/write-intents', version: '1' })
export class WriteBackController {
  constructor(private readonly intents: WriteIntentAdminService) {}

  @Get()
  @RequirePermission('sync:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listSourceWriteIntents',
    summary: 'List the writes the source system has not acknowledged',
    description:
      'A stuck write is a synchronization fact: an act taken in StudViro that the university’s system has not accepted. A `rejected` one was refused and has already been compensated; an `abandoned` one may or may not have landed, so nothing was reversed.',
  })
  @ApiOkResponse({ type: WriteIntentResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Query() query: ListWriteIntentsQueryDto,
  ): Promise<WriteIntentResponseDto[]> {
    const intents = await this.intents.listUndelivered(institutionId, query.limit);

    return intents.map((intent) => WriteIntentResponseDto.fromEntity(intent));
  }

  @Post(':id/retry')
  @RequirePermission('sync:run', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'retrySourceWriteIntent',
    summary: 'Offer a stuck write to the source system again',
  })
  @ApiOkResponse({ type: WriteIntentResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async retry(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WriteIntentResponseDto> {
    return WriteIntentResponseDto.fromEntity(await this.intents.retry(institutionId, id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sync:run', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'discardSourceWriteIntent',
    summary: 'Give up on a stuck write, leaving the two systems in disagreement',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async discard(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.intents.discard(institutionId, id);
  }
}
