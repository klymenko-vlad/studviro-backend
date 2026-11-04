import { ApiProperty } from '@nestjs/swagger';

import { CursorPageMetaDto } from '../../../common/dto/pagination.dto';
import type { PersonalTask } from '../../../database/schema';
import type { PersonalTaskPage } from '../personal-tasks.repository';

export class PersonalTaskDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty() readonly title: string;
  @ApiProperty({ type: String, nullable: true }) readonly note: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly dueAt: Date | null;
  @ApiProperty() readonly done: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly completedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly updatedAt: Date;

  constructor(task: PersonalTask) {
    this.id = task.id;
    this.title = task.title;
    this.note = task.note;
    this.dueAt = task.dueAt;
    this.done = task.completedAt !== null;
    this.completedAt = task.completedAt;
    this.createdAt = task.createdAt;
    this.updatedAt = task.updatedAt;
  }
}

export class PersonalTaskPageDto {
  @ApiProperty({
    type: PersonalTaskDto,
    isArray: true,
    description: 'Soonest due first; tasks without a due time last.',
  })
  readonly items: PersonalTaskDto[];

  @ApiProperty({ type: CursorPageMetaDto }) readonly meta: CursorPageMetaDto;

  constructor(page: PersonalTaskPage, limit: number) {
    this.items = page.tasks.map((task) => new PersonalTaskDto(task));
    this.meta = new CursorPageMetaDto(limit, page.hasNextPage, page.nextCursor);
  }
}
