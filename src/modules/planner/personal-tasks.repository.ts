import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';

import { decodeCursor, encodeCursor } from '../../database/repository/cursor';
import { escapeLike } from '../../database/repository/escape-like';
import { personalTasks, type NewPersonalTask, type PersonalTask } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { PlannerRange } from './planner-range';
import type { TaskState } from './task-state';

export interface PersonalTaskOwner {
  readonly institutionId: string;
  readonly userId: string;
}

export interface PersonalTaskPageQuery {
  readonly limit: number;
  readonly status: TaskState;
  readonly cursor?: string | undefined;
  readonly q?: string | undefined;
}

export interface PersonalTaskPage {
  readonly tasks: PersonalTask[];
  readonly hasNextPage: boolean;
  readonly nextCursor: string | null;
}

const UNDATED = 'infinity';
const dueOrder = sql`coalesce(${personalTasks.dueAt}, 'infinity'::timestamptz)`;

@Injectable()
export class PersonalTasksRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findPage(
    owner: PersonalTaskOwner,
    query: PersonalTaskPageQuery,
  ): Promise<PersonalTaskPage> {
    const rows = await this.txHost
      .reader()
      .select()
      .from(personalTasks)
      .where(and(this.ownedBy(owner), ...this.narrowings(query)))
      .orderBy(asc(dueOrder), asc(personalTasks.id))
      .limit(query.limit + 1);

    const hasNextPage = rows.length > query.limit;
    const tasks = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = tasks.at(-1);

    return {
      tasks,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor({ value: last.dueAt ?? UNDATED, id: last.id })
          : null,
    };
  }

  findOpenDue(owner: PersonalTaskOwner, range: PlannerRange): Promise<PersonalTask[]> {
    return this.txHost
      .reader()
      .select()
      .from(personalTasks)
      .where(
        and(
          this.ownedBy(owner),
          isNull(personalTasks.completedAt),
          isNotNull(personalTasks.dueAt),
          gte(personalTasks.dueAt, range.from),
          lt(personalTasks.dueAt, range.to),
        ),
      )
      .orderBy(asc(personalTasks.dueAt), asc(personalTasks.id));
  }

  async findOwned(owner: PersonalTaskOwner, taskId: string): Promise<PersonalTask | undefined> {
    const [task] = await this.txHost
      .reader()
      .select()
      .from(personalTasks)
      .where(and(this.ownedBy(owner), eq(personalTasks.id, taskId)));

    return task;
  }

  async insert(task: NewPersonalTask): Promise<PersonalTask> {
    const [created] = await this.txHost.client().insert(personalTasks).values(task).returning();

    if (!created) throw new Error('the task insert returned no row');

    return created;
  }

  async update(
    owner: PersonalTaskOwner,
    taskId: string,
    changes: Partial<
      Pick<PersonalTask, 'title' | 'note' | 'dueAt' | 'completedAt' | 'deletedAt'>
    >,
  ): Promise<PersonalTask | undefined> {
    const [updated] = await this.txHost
      .client()
      .update(personalTasks)
      .set(changes)
      .where(and(this.ownedBy(owner), eq(personalTasks.id, taskId)))
      .returning();

    return updated;
  }

  private ownedBy(owner: PersonalTaskOwner): SQL {
    return (
      and(
        eq(personalTasks.institutionId, owner.institutionId),
        eq(personalTasks.userId, owner.userId),
        isNull(personalTasks.deletedAt),
      ) ?? sql`false`
    );
  }

  private narrowings(query: PersonalTaskPageQuery): SQL[] {
    const filters: SQL[] = [];

    if (query.status === 'open') filters.push(isNull(personalTasks.completedAt));
    if (query.status === 'done') filters.push(isNotNull(personalTasks.completedAt));

    const search = query.q?.trim();
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      filters.push(
        sql`(${personalTasks.title} ilike ${pattern} or ${personalTasks.note} ilike ${pattern})`,
      );
    }

    if (query.cursor) {
      const { value, id } = decodeCursor(query.cursor);
      const due = value instanceof Date ? value.toISOString() : String(value);
      filters.push(
        sql`(${dueOrder}, ${personalTasks.id}) > (${due}::timestamptz, ${id}::uuid)`,
      );
    }

    return filters;
  }
}
