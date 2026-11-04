import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';

import {
  TeachersRepository,
  type TeacherDepartment,
  type TeacherIdentity,
} from './teachers.repository';

export interface TeacherProfile extends TeacherIdentity {
  readonly departments: TeacherDepartment[];
}

@Injectable()
export class TeacherProfileService {
  constructor(private readonly teachers: TeachersRepository) {}

  async profile(institutionId: string, teacherId: string): Promise<TeacherProfile> {
    const teacher = await this.teachers.findTeacher(institutionId, teacherId);
    if (!teacher) throw new EntityNotFoundError('teacher', teacherId);

    return {
      ...teacher,
      departments: await this.teachers.departments(institutionId, teacherId),
    };
  }
}
