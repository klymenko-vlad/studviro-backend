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
  Query,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { CreatePersonalEventDto, UpdatePersonalEventDto } from './dto/personal-event-input.dto';
import { PersonalEventDto } from './dto/personal-event.dto';
import { PlannerRangeQueryDto } from './dto/planner-range.query.dto';
import { PersonalEventsService } from './personal-events.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('schedule')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/personal-events', version: '1' })
export class PersonalEventsController {
  constructor(private readonly events: PersonalEventsService) {}

  @Get()
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listMyPersonalEvents',
    summary: 'The current user’s own events overlapping a date range',
  })
  @ApiOkResponse({ type: PersonalEventDto, isArray: true })
  @ApiErrorResponses()
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() range: PlannerRangeQueryDto,
  ): Promise<PersonalEventDto[]> {
    const events = await this.events.list({ institutionId, userId }, range);

    return events.map((event) => new PersonalEventDto(event));
  }

  @Post()
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createMyPersonalEvent',
    summary: 'Add an event to the current user’s planner',
  })
  @ApiCreatedResponse({ type: PersonalEventDto })
  @ApiErrorResponses()
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Body() input: CreatePersonalEventDto,
  ): Promise<PersonalEventDto> {
    return new PersonalEventDto(await this.events.create({ institutionId, userId }, input));
  }

  @Patch(':eventId')
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateMyPersonalEvent',
    summary: 'Edit or move one of the current user’s events',
  })
  @ApiOkResponse({ type: PersonalEventDto })
  @ApiErrorResponses({ notFound: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('id') userId: string,
    @Body() input: UpdatePersonalEventDto,
  ): Promise<PersonalEventDto> {
    return new PersonalEventDto(
      await this.events.update({ institutionId, userId }, eventId, input),
    );
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'deleteMyPersonalEvent',
    summary: 'Remove one of the current user’s events',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.events.remove({ institutionId, userId }, eventId);
  }
}
