import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { InvalidInputError } from '../../common/errors/domain.error';
import {
  academicTerms,
  courseOfferings,
  courses,
  programMemberships,
  programs,
  users,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { BulkParseError, parseDelimited } from './bulk-entry.parser';
import { InstitutionMembershipService } from './institution-membership.service';

export type BulkRowStatus = 'created' | 'skipped' | 'failed';

export interface BulkRowResult {
  readonly line: number;
  readonly status: BulkRowStatus;
  /** A code a screen can translate, plus the detail a human needs. */
  readonly code: string;
  readonly detail: string;
}

export interface BulkImportResult {
  readonly dryRun: boolean;
  readonly total: number;
  readonly created: number;
  readonly skipped: number;
  readonly failed: number;
  readonly rows: BulkRowResult[];
}

const OFFERING_COLUMNS = ['coursecode', 'termcode'] as const;
const MEMBER_COLUMNS = ['email', 'programcode'] as const;

/**
 * Setting up a term one form at a time is the difference between a platform an
 * institution can adopt and one it cannot. This takes a block of text pasted
 * out of a spreadsheet and applies it.
 *
 * Two rules shape the whole thing. **A dry run is the default posture**: the
 * caller sees exactly what would happen, row by row, before anything is
 * written, because the alternative is discovering a typo in row 300 after 299
 * rows already exist. And **one bad row never fails the batch** — it is
 * reported and the rest proceed, since a cohort list with two malformed
 * addresses in it is the normal case, not an exceptional one.
 */
@Injectable()
export class BulkEntryService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly membership: InstitutionMembershipService,
  ) {}

  /** `courseCode,termCode[,capacity,language,status]` */
  async importOfferings(
    institutionId: string,
    text: string,
    dryRun: boolean,
  ): Promise<BulkImportResult> {
    const parsed = this.parse(text, OFFERING_COLUMNS);

    return this.txHost.run(async () => {
      const results: BulkRowResult[] = [];

      for (const row of parsed.rows) {
        results.push(await this.importOffering(institutionId, row, dryRun));
      }

      return summarise(results, dryRun);
    });
  }

  /** `email,programCode[,studyYear]` */
  async importMembers(
    institutionId: string,
    text: string,
    dryRun: boolean,
  ): Promise<BulkImportResult> {
    const parsed = this.parse(text, MEMBER_COLUMNS);

    return this.txHost.run(async () => {
      const results: BulkRowResult[] = [];

      for (const row of parsed.rows) {
        results.push(await this.importMember(institutionId, row, dryRun));
      }

      return summarise(results, dryRun);
    });
  }

  private async importOffering(
    institutionId: string,
    row: { line: number; values: Record<string, string> },
    dryRun: boolean,
  ): Promise<BulkRowResult> {
    const courseCode = row.values.coursecode ?? '';
    const termCode = row.values.termcode ?? '';
    const at = (code: string, detail: string, status: BulkRowStatus = 'failed') => ({
      line: row.line,
      status,
      code,
      detail,
    });

    if (courseCode === '' || termCode === '') {
      return at('ROW_INCOMPLETE', 'A course code and a term code are both required');
    }

    const [course] = await this.client
      .select({ id: courses.id, orgUnitId: courses.orgUnitId })
      .from(courses)
      .where(
        and(
          eq(courses.institutionId, institutionId),
          eq(courses.code, courseCode),
          isNull(courses.deletedAt),
        ),
      )
      .limit(1);
    if (!course) return at('COURSE_NOT_FOUND', `No course has the code ${courseCode}`);

    const [term] = await this.client
      .select({ id: academicTerms.id })
      .from(academicTerms)
      .where(
        and(
          eq(academicTerms.institutionId, institutionId),
          eq(academicTerms.code, termCode),
          isNull(academicTerms.deletedAt),
        ),
      )
      .limit(1);
    if (!term) return at('TERM_NOT_FOUND', `No academic term has the code ${termCode}`);

    const [existing] = await this.client
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(
        and(
          eq(courseOfferings.courseId, course.id),
          eq(courseOfferings.academicTermId, term.id),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      return at(
        'OFFERING_ALREADY_EXISTS',
        `${courseCode} already runs in ${termCode}`,
        'skipped',
      );
    }

    const capacity = this.optionalInteger(row.values.capacity);
    if (capacity === 'invalid') {
      return at('CAPACITY_NOT_A_NUMBER', 'Capacity must be a whole number');
    }

    if (!dryRun) {
      await this.client.insert(courseOfferings).values({
        institutionId,
        courseId: course.id,
        academicTermId: term.id,
        orgUnitId: course.orgUnitId,
        capacity,
        language: row.values.language === '' ? null : (row.values.language ?? null),
      });
    }

    return at('OFFERING_CREATED', `${courseCode} will run in ${termCode}`, 'created');
  }

  private async importMember(
    institutionId: string,
    row: { line: number; values: Record<string, string> },
    dryRun: boolean,
  ): Promise<BulkRowResult> {
    const email = (row.values.email ?? '').toLowerCase();
    const programCode = row.values.programcode ?? '';
    const at = (code: string, detail: string, status: BulkRowStatus = 'failed') => ({
      line: row.line,
      status,
      code,
      detail,
    });

    if (email === '' || programCode === '') {
      return at('ROW_INCOMPLETE', 'An email and a programme code are both required');
    }

    const [program] = await this.client
      .select({ id: programs.id })
      .from(programs)
      .where(
        and(
          eq(programs.institutionId, institutionId),
          eq(programs.code, programCode),
          isNull(programs.deletedAt),
        ),
      )
      .limit(1);
    if (!program) return at('PROGRAM_NOT_FOUND', `No programme has the code ${programCode}`);

    const [person] = await this.client
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    if (!person) {
      return at('PERSON_NOT_FOUND', `${email} has no account; invite them first`);
    }

    if (!(await this.membership.isKnown(institutionId, person.id, person.email))) {
      return at(
        'PERSON_NOT_IN_INSTITUTION',
        `${email} is not part of this institution; invite them first`,
      );
    }

    const [existing] = await this.client
      .select({ id: programMemberships.id })
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.programId, program.id),
          eq(programMemberships.userId, person.id),
          isNull(programMemberships.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      return at(
        'PROGRAM_MEMBERSHIP_EXISTS',
        `${email} is already on ${programCode}`,
        'skipped',
      );
    }

    const studyYear = this.optionalInteger(row.values.studyyear);
    if (studyYear === 'invalid') {
      return at('STUDY_YEAR_NOT_A_NUMBER', 'The study year must be a whole number');
    }

    if (!dryRun) {
      await this.client.insert(programMemberships).values({
        institutionId,
        programId: program.id,
        userId: person.id,
        status: 'active',
        studyYear,
        startedAt: new Date(),
      });
    }

    return at('MEMBERSHIP_CREATED', `${email} will join ${programCode}`, 'created');
  }

  private parse(text: string, required: readonly string[]) {
    let parsed;
    try {
      parsed = parseDelimited(text);
    } catch (error: unknown) {
      if (error instanceof BulkParseError) {
        throw new InvalidInputError('BULK_UNREADABLE', error.message);
      }
      throw error;
    }

    const missing = required.filter((column) => !parsed.headers.includes(column));
    if (missing.length > 0) {
      throw new InvalidInputError(
        'BULK_COLUMNS_MISSING',
        `The first row must name these columns: ${missing.join(', ')}`,
        { missing, found: parsed.headers },
      );
    }

    return parsed;
  }

  private optionalInteger(raw: string | undefined): number | null | 'invalid' {
    if (raw === undefined || raw.trim() === '') return null;
    if (!/^\d+$/u.test(raw.trim())) return 'invalid';

    return Number(raw.trim());
  }

  private get client() {
    return this.txHost.client();
  }
}

function summarise(rows: BulkRowResult[], dryRun: boolean): BulkImportResult {
  const count = (status: BulkRowStatus) => rows.filter((row) => row.status === status).length;

  return {
    dryRun,
    total: rows.length,
    created: count('created'),
    skipped: count('skipped'),
    failed: count('failed'),
    rows,
  };
}
