import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import type { PersonalTask } from '../../database/schema';

import type {
  CreatePersonalTaskDto,
  UpdatePersonalTaskDto,
} from './dto/personal-task-input.dto';
import {
  PersonalTasksRepository,
  type PersonalTaskOwner,
  type PersonalTaskPage,
  type PersonalTaskPageQuery,
} from './personal-tasks.repository';
import { assertPlannerRange, type PlannerRange } from './planner-range';

@Injectable()
export class PersonalTasksService {
  constructor(private readonly tasks: PersonalTasksRepository) {}

  list(owner: PersonalTaskOwner, query: PersonalTaskPageQuery): Promise<PersonalTaskPage> {
    return this.tasks.findPage(owner, query);
  }

  listOpenDue(owner: PersonalTaskOwner, range: PlannerRange): Promise<PersonalTask[]> {
    assertPlannerRange(range);

    return this.tasks.findOpenDue(owner, range);
  }

  create(owner: PersonalTaskOwner, input: CreatePersonalTaskDto): Promise<PersonalTask> {
    return this.tasks.insert({
      ...owner,
      title: input.title,
      note: input.note ?? null,
      dueAt: input.dueAt ?? null,
    });
  }

  async update(
    owner: PersonalTaskOwner,
    taskId: string,
    input: UpdatePersonalTaskDto,
    now = new Date(),
  ): Promise<PersonalTask> {
    const current = await this.owned(owner, taskId);
    const completedAt =
      input.done === undefined
        ? current.completedAt
        : input.done
          ? (current.completedAt ?? now)
          : null;

    const updated = await this.tasks.update(owner, taskId, {
      title: input.title ?? current.title,
      note: input.note === undefined ? current.note : input.note,
      dueAt: input.dueAt === undefined ? current.dueAt : input.dueAt,
      completedAt,
    });

    return updated ?? notFound(taskId);
  }

  async remove(owner: PersonalTaskOwner, taskId: string, now = new Date()): Promise<void> {
    const removed = await this.tasks.update(owner, taskId, { deletedAt: now });
    if (!removed) notFound(taskId);
  }

  private async owned(owner: PersonalTaskOwner, taskId: string): Promise<PersonalTask> {
    return (await this.tasks.findOwned(owner, taskId)) ?? notFound(taskId);
  }
}

function notFound(taskId: string): never {
  throw new EntityNotFoundError('PersonalTask', taskId);
}
