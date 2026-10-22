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

import { CreateRoomDto, RoomResponseDto, UpdateRoomDto } from './dto/room.dto';
import { RoomsService } from './rooms.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

/**
 * Rooms sit behind `schedule:manage` rather than `institution:manage`: a room
 * is where teaching happens, and whoever timetables the teaching is the person
 * who knows a lab has been taken out of service.
 */
@ApiTags('org-units')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/rooms', version: '1' })
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'listRooms', summary: 'List the institution’s rooms' })
  @ApiOkResponse({ type: RoomResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<RoomResponseDto[]> {
    const rooms = await this.rooms.list(institutionId);

    return rooms.map((room) => RoomResponseDto.fromEntity(room));
  }

  @Post()
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'createRoom', summary: 'Add a room' })
  @ApiCreatedResponse({ type: RoomResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: CreateRoomDto,
  ): Promise<RoomResponseDto> {
    return RoomResponseDto.fromEntity(await this.rooms.create(institutionId, dto));
  }

  @Patch(':id')
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({ operationId: 'updateRoom', summary: 'Correct a room' })
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    return RoomResponseDto.fromEntity(await this.rooms.update(institutionId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeRoom',
    summary: 'Take a room out of service, if nothing is booked into it',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.rooms.remove(institutionId, id);
  }
}
