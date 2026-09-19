import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { CursorPaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_TYPES,
  type AuditAction,
  type AuditSubjectType,
} from '../audit-actions';

export class ListAuditEventsQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({ enum: AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction;

  @ApiPropertyOptional({ enum: AUDIT_SUBJECT_TYPES })
  @IsOptional()
  @IsIn(AUDIT_SUBJECT_TYPES)
  subjectType?: AuditSubjectType;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}
