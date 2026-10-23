import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import type { CourseStudent } from '../course-students.repository';
import type { StudentPage, StudentView } from '../student-view.service';

import { AssignmentResponseDto } from './assignment.dto';
import { ProgressResponseDto } from './completion.dto';
import { LearningMaterialResponseDto } from './learning-material.dto';
import { LearningSectionResponseDto } from './learning-section.dto';

export class StudentViewQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The enrolled student to see the page as. Without it, a student with no progress and in no group.',
  })
  @IsOptional()
  @IsUUID()
  asStudent?: string;
}

@Exclude()
export class CourseStudentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;

  static from(student: CourseStudent): CourseStudentDto {
    return Object.assign(new CourseStudentDto(), student);
  }
}

@Exclude()
export class StudentViewResponseDto {
  @Expose()
  @ApiProperty({
    type: CourseStudentDto,
    nullable: true,
    description: 'Who the page is shown as; null for a student with no progress and no group.',
  })
  student!: CourseStudentDto | null;

  @Expose()
  @ApiProperty({ type: LearningSectionResponseDto, isArray: true })
  sections!: LearningSectionResponseDto[];

  @Expose()
  @ApiProperty({ type: LearningMaterialResponseDto, isArray: true })
  materials!: LearningMaterialResponseDto[];

  @Expose()
  @ApiProperty({ type: AssignmentResponseDto, isArray: true })
  assignments!: AssignmentResponseDto[];

  @Expose() @ApiProperty({ type: ProgressResponseDto }) progress!: ProgressResponseDto;

  static from(view: StudentView, now = new Date()): StudentViewResponseDto {
    return Object.assign(new StudentViewResponseDto(), {
      student: view.student === null ? null : CourseStudentDto.from(view.student),
      sections: view.sections.map((section) => LearningSectionResponseDto.from(section, now)),
      materials: view.materials.map((material) =>
        LearningMaterialResponseDto.from(material, now),
      ),
      assignments: view.assignments.map((entry) => AssignmentResponseDto.from(entry, now)),
      progress: ProgressResponseDto.from(view.progress),
    });
  }
}

@Exclude()
export class CourseStudentPageResponseDto {
  @Expose() @ApiProperty({ type: CourseStudentDto, isArray: true }) items!: CourseStudentDto[];
  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(page: StudentPage): CourseStudentPageResponseDto {
    return Object.assign(new CourseStudentPageResponseDto(), {
      items: page.students.map((student) => CourseStudentDto.from(student)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
    });
  }
}
