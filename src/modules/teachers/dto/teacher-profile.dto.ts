import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import type {
  TeacherDepartment,
  TeacherOffering,
  TeacherProfile,
} from '../teacher-profile.service';

@Exclude()
export class TeacherDepartmentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
}

@Exclude()
export class TeacherOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) offeringId!: string;
  @Expose() @ApiProperty() courseTitle!: string;
  @Expose() @ApiProperty() courseCode!: string;
  @Expose() @ApiProperty() termName!: string;

  @Expose()
  @ApiProperty({
    description:
      'Whether the caller may open this course page: they teach it, are or were enrolled on it, or administer offerings.',
  })
  viewerCanOpen!: boolean;
}

@Exclude()
export class TeacherProfileResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;

  @Expose()
  @Type(() => TeacherDepartmentDto)
  @ApiProperty({ type: TeacherDepartmentDto, isArray: true })
  departments!: TeacherDepartment[];

  @Expose()
  @Type(() => TeacherOfferingDto)
  @ApiProperty({ type: TeacherOfferingDto, isArray: true, description: 'Newest term first.' })
  offerings!: TeacherOffering[];

  static from(profile: TeacherProfile): TeacherProfileResponseDto {
    return Object.assign(new TeacherProfileResponseDto(), profile);
  }
}
