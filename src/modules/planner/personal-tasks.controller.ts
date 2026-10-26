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

import { ListPersonalTasksQueryDto } from './dto/list-personal-tasks.query.dto';
import { CreatePersonalTaskDto, UpdatePersonalTaskDto } from './dto/personal-task-input.dto';
import { PersonalTaskDto, PersonalTaskPageDto } from './dto/personal-task.dto';
import { PlannerRangeQueryDto } from './dto/planner-range.query.dto';
import { PersonalTasksService } from './personal-tasks.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('schedule')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/tasks', version: '1' })
export class PersonalTasksController {
  constructor(private readonly tasks: PersonalTasksService) {}

  @Get()
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listMyTasks',
    summary: 'The current user’s own tasks, soonest due first, a page at a time',
  })
  @ApiOkResponse({ type: PersonalTaskPageDto })
  @ApiErrorResponses()
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListPersonalTasksQueryDto,
  ): Promise<PersonalTaskPageDto> {
    const page = await this.tasks.list({ institutionId, userId }, query);

    return new PersonalTaskPageDto(page, query.limit);
  }

  @Get('due')
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listMyDueTasks',
    summary: 'The current user’s open tasks falling due in a date range',
  })
  @ApiOkResponse({ type: PersonalTaskDto, isArray: true })
  @ApiErrorResponses()
  async listDue(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() range: PlannerRangeQueryDto,
  ): Promise<PersonalTaskDto[]> {
    const tasks = await this.tasks.listOpenDue({ institutionId, userId }, range);

    return tasks.map((task) => new PersonalTaskDto(task));
  }

  @Post()
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createMyTask',
    summary: 'Add a task to the current user’s planner',
  })
  @ApiCreatedResponse({ type: PersonalTaskDto })
  @ApiErrorResponses()
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Body() input: CreatePersonalTaskDto,
  ): Promise<PersonalTaskDto> {
    return new PersonalTaskDto(await this.tasks.create({ institutionId, userId }, input));
  }

  @Patch(':taskId')
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateMyTask',
    summary: 'Edit, complete or reopen one of the current user’s tasks',
  })
  @ApiOkResponse({ type: PersonalTaskDto })
  @ApiErrorResponses({ notFound: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser('id') userId: string,
    @Body() input: UpdatePersonalTaskDto,
  ): Promise<PersonalTaskDto> {
    return new PersonalTaskDto(
      await this.tasks.update({ institutionId, userId }, taskId, input),
    );
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'deleteMyTask',
    summary: 'Remove one of the current user’s tasks',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.tasks.remove({ institutionId, userId }, taskId);
  }
}
