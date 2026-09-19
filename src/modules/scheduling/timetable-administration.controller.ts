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

import {
  CreateTimetableEventDto,
  TimetableEventResponseDto,
  UpdateTimetableEventDto,
} from './dto/timetable-administration.dto';
import { TimetableAdministrationService } from './timetable-administration.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('scheduling')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/timetable',
  version: '1',
})
export class TimetableAdministrationController {
  constructor(private readonly timetable: TimetableAdministrationService) {}

  @Get()
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listOfferingTimetable',
    summary: 'Every class scheduled for this offering, in time order',
  })
  @ApiOkResponse({ type: TimetableEventResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
  ): Promise<TimetableEventResponseDto[]> {
    const entries = await this.timetable.list(institutionId, offeringId);

    return entries.map((entry) => TimetableEventResponseDto.from(entry));
  }

  @Post()
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createTimetableEvent',
    summary: 'Schedule a class, once or weekly to the end of term',
    description:
      'With `repeatWeekly`, one slot becomes a row per week until the term ends, so moving or cancelling a single week is an ordinary edit. A room already booked for any part of the slot is refused.',
  })
  @ApiCreatedResponse({ description: 'The number of classes scheduled.' })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Body() dto: CreateTimetableEventDto,
  ): Promise<{ created: number }> {
    const events = await this.timetable.create(institutionId, offeringId, dto);

    return { created: events.length };
  }

  @Patch(':eventId')
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'updateTimetableEvent', summary: 'Move a single class' })
  @ApiOkResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateTimetableEventDto,
  ): Promise<{ id: string }> {
    const updated = await this.timetable.update(institutionId, offeringId, eventId, dto);

    return { id: updated.id };
  }

  @Post(':eventId/cancellation')
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'cancelTimetableEvent',
    summary: 'Call a class off, leaving it on the calendar',
    description:
      'A cancelled class stays visible and struck through: a student who turns up needs to see it was called off, not find nothing where it used to be.',
  })
  @ApiOkResponse()
  @ApiErrorResponses({ notFound: true })
  async cancel(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<{ id: string }> {
    const cancelled = await this.timetable.cancel(institutionId, offeringId, eventId);

    return { id: cancelled.id };
  }

  @Delete(':eventId/cancellation')
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'restoreTimetableEvent',
    summary: 'Put a cancelled class back on',
  })
  @ApiOkResponse()
  @ApiErrorResponses({ notFound: true })
  async restore(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<{ id: string }> {
    const restored = await this.timetable.restore(institutionId, offeringId, eventId);

    return { id: restored.id };
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeTimetableEvent',
    summary: 'Remove a class that should never have been scheduled',
    description: 'Cancelling says it was called off; removing says it never existed.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<void> {
    await this.timetable.remove(institutionId, offeringId, eventId);
  }
}
