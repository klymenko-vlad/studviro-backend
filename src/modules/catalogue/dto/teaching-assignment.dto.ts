import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

import { TEACHING_ROLES, type TeachingRole } from '../../../database/schema';
import type { TeachingAssignmentEntry } from '../teaching-assignments.service';

export class AssignTeacherDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ enum: TEACHING_ROLES })
  @IsOptional()
  @IsIn(TEACHING_ROLES)
  role?: TeachingRole;

  @ApiPropertyOptional({
    description: 'At most one per offering — promoting a second demotes the first.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

@Exclude()
export class TeachingAssignmentResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;
  @Expose() @ApiProperty({ enum: TEACHING_ROLES }) role!: TeachingRole;
  @Expose() @ApiProperty() isPrimary!: boolean;

  static from(entry: TeachingAssignmentEntry): TeachingAssignmentResponseDto {
    return Object.assign(new TeachingAssignmentResponseDto(), entry);
  }
}
