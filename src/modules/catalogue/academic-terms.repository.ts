import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';

import { ConflictError } from '../../common/errors/domain.error';
import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import { academicTerms, courseOfferings, type AcademicTerm } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class AcademicTermsRepository extends InstitutionScopedRepository<typeof academicTerms> {
  protected override readonly sortable = {
    code: academicTerms.code,
    startsAt: academicTerms.startsAt,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, academicTerms);
  }

  /** Newest first: the term an administrator is working on is almost always the next one. */
  listFor(institutionId: string): Promise<AcademicTerm[]> {
    return this.findManyIn(institutionId, { orderBy: desc(academicTerms.startsAt) });
  }

  listOrderedByStart(institutionId: string): Promise<AcademicTerm[]> {
    return this.findManyIn(institutionId, { orderBy: asc(academicTerms.startsAt) });
  }

  async assertCodeFree(institutionId: string, code: string, exceptId?: string): Promise<void> {
    const taken = await this.existsIn(
      institutionId,
      and(eq(academicTerms.code, code), exceptId ? ne(academicTerms.id, exceptId) : undefined),
      { consistent: true },
    );

    if (taken) {
      throw new ConflictError(
        'ACADEMIC_TERM_CODE_TAKEN',
        'Another academic term already has that code',
        { code },
      );
    }
  }

  async countOfferings(termId: string): Promise<number> {
    const rows = await this.txHost
      .reader()
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(
        and(eq(courseOfferings.academicTermId, termId), isNull(courseOfferings.deletedAt)),
      );

    return rows.length;
  }
}
