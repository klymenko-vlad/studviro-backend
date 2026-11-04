import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { CursorPaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TASK_STATES, type TaskState } from '../task-state';

export class ListPersonalTasksQueryDto extends OmitType(CursorPaginationQueryDto, ['order']) {
  @ApiPropertyOptional({ enum: TASK_STATES, enumName: 'PersonalTaskState', default: 'open' })
  @IsOptional()
  @IsIn(TASK_STATES)
  status: TaskState = 'open';

  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to tasks whose title or note contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
