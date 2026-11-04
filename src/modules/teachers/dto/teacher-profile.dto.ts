import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import type { TeacherProfile } from '../teacher-profile.service';
import type { TeacherDepartment } from '../teachers.repository';

@Exclude()
export class TeacherDepartmentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
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

  static from(profile: TeacherProfile): TeacherProfileResponseDto {
    return Object.assign(new TeacherProfileResponseDto(), profile);
  }
}
