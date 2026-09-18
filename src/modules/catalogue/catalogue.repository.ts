import { Injectable } from '@nestjs/common';
import { and, asc, eq, ne } from 'drizzle-orm';

import { ConflictError } from '../../common/errors/domain.error';
import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import { courses, programs, type Course, type Program } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class ProgramsCatalogueRepository extends InstitutionScopedRepository<typeof programs> {
  protected override readonly sortable = { code: programs.code, name: programs.name };

  constructor(txHost: TransactionHost) {
    super(txHost, programs);
  }

  listFor(institutionId: string): Promise<Program[]> {
    return this.findManyIn(institutionId, { orderBy: asc(programs.code) });
  }

  async assertCodeFree(institutionId: string, code: string, exceptId?: string): Promise<void> {
    const taken = await this.existsIn(
      institutionId,
      and(eq(programs.code, code), exceptId ? ne(programs.id, exceptId) : undefined),
      { consistent: true },
    );

    if (taken) {
      throw new ConflictError('PROGRAM_CODE_TAKEN', 'Another programme already has that code', {
        code,
      });
    }
  }
}

@Injectable()
export class CoursesCatalogueRepository extends InstitutionScopedRepository<typeof courses> {
  protected override readonly sortable = { code: courses.code, title: courses.title };

  constructor(txHost: TransactionHost) {
    super(txHost, courses);
  }

  listFor(institutionId: string): Promise<Course[]> {
    return this.findManyIn(institutionId, { orderBy: asc(courses.code) });
  }

  async assertCodeFree(institutionId: string, code: string, exceptId?: string): Promise<void> {
    const taken = await this.existsIn(
      institutionId,
      and(eq(courses.code, code), exceptId ? ne(courses.id, exceptId) : undefined),
      { consistent: true },
    );

    if (taken) {
      throw new ConflictError('COURSE_CODE_TAKEN', 'Another course already has that code', {
        code,
      });
    }
  }
}
