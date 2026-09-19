import { Injectable } from '@nestjs/common';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import type { AcademicTerm, AcademicTermKind } from '../../database/schema';

import { AcademicTermsRepository } from './academic-terms.repository';

export interface AcademicTermInput {
  readonly code: string;
  readonly name: string;
  readonly kind?: AcademicTermKind;
  readonly academicYear: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly enrollmentOpensAt?: Date | null;
  readonly enrollmentClosesAt?: Date | null;
}

/**
 * The academic term is the spine of the year: an offering hangs off one, the
 * enrolment window lives on it, and until an institution can create one there
 * is nothing for a student to enrol into.
 */
@Injectable()
export class AcademicTermsService {
  constructor(private readonly terms: AcademicTermsRepository) {}

  list(institutionId: string): Promise<AcademicTerm[]> {
    return this.terms.listFor(institutionId);
  }

  async create(institutionId: string, input: AcademicTermInput): Promise<AcademicTerm> {
    assertCoherent(
      input.startsAt,
      input.endsAt,
      input.enrollmentOpensAt,
      input.enrollmentClosesAt,
    );
    await this.terms.assertCodeFree(institutionId, input.code);

    return this.terms.create({
      institutionId,
      code: input.code,
      name: input.name,
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      academicYear: input.academicYear,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      enrollmentOpensAt: input.enrollmentOpensAt ?? null,
      enrollmentClosesAt: input.enrollmentClosesAt ?? null,
    });
  }

  async update(
    institutionId: string,
    id: string,
    input: Partial<AcademicTermInput>,
  ): Promise<AcademicTerm> {
    const existing = await this.terms.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('academic_term', id);

    const merged = { ...existing, ...definedOnly(input) };
    assertCoherent(
      merged.startsAt,
      merged.endsAt,
      merged.enrollmentOpensAt,
      merged.enrollmentClosesAt,
    );

    if (input.code !== undefined) {
      await this.terms.assertCodeFree(institutionId, input.code, id);
    }

    return this.terms.update(id, definedOnly(input));
  }

  /**
   * Retiring a term that offerings hang off would strand them, so it is
   * refused rather than cascaded: the offerings are the institution's record of
   * what it taught.
   */
  async remove(institutionId: string, id: string): Promise<void> {
    const existing = await this.terms.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('academic_term', id);

    const offerings = await this.terms.countOfferings(id);
    if (offerings > 0) {
      throw new ConflictError(
        'ACADEMIC_TERM_IN_USE',
        'This term still has course offerings; retire those first',
        { offerings },
      );
    }

    await this.terms.softDelete(id);
  }
}

function assertCoherent(
  startsAt: Date,
  endsAt: Date,
  enrollmentOpensAt: Date | null | undefined,
  enrollmentClosesAt: Date | null | undefined,
): void {
  if (endsAt <= startsAt) {
    throw new ConflictError(
      'ACADEMIC_TERM_ENDS_BEFORE_IT_STARTS',
      'A term must end after it starts',
    );
  }

  if (enrollmentOpensAt && enrollmentClosesAt && enrollmentClosesAt <= enrollmentOpensAt) {
    throw new ConflictError(
      'ENROLLMENT_WINDOW_CLOSES_BEFORE_IT_OPENS',
      'The enrolment window must close after it opens',
    );
  }

  if (enrollmentClosesAt && enrollmentClosesAt > endsAt) {
    throw new ConflictError(
      'ENROLLMENT_WINDOW_OUTLIVES_THE_TERM',
      'Enrolment cannot stay open after the term has ended',
    );
  }
}

function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
