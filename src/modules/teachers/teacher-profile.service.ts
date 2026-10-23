import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  orgUnits,
  teachingAssignments,
  users,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { AuthorizationService } from '../authorization/authorization.service';
import { administersOfferings } from '../courses/administers-offering';

const MAX_OFFERINGS = 50;

export interface TeacherDepartment {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface TeacherOffering {
  readonly offeringId: string;
  readonly courseTitle: string;
  readonly courseCode: string;
  readonly termName: string;
  readonly viewerCanOpen: boolean;
}

export interface TeacherProfile {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly departments: TeacherDepartment[];
  readonly offerings: TeacherOffering[];
}

@Injectable()
export class TeacherProfileService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly authorization: AuthorizationService,
  ) {}

  async profile(
    institutionId: string,
    teacherId: string,
    viewerId: string,
  ): Promise<TeacherProfile> {
    const [teacher] = await this.reader
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(and(eq(users.id, teacherId), isNull(users.deletedAt)))
      .limit(1);
    const taught = await this.taught(institutionId, teacherId);

    if (!teacher || taught.length === 0) throw new EntityNotFoundError('teacher', teacherId);

    const openable = await this.openableBy(
      institutionId,
      viewerId,
      taught.map((row) => row.offeringId),
    );

    return {
      ...teacher,
      departments: distinctDepartments(taught),
      offerings: taught.map(({ offeringId, courseTitle, courseCode, termName }) => ({
        offeringId,
        courseTitle,
        courseCode,
        termName,
        viewerCanOpen: openable(offeringId),
      })),
    };
  }

  private async taught(institutionId: string, teacherId: string) {
    const rows = await this.reader
      .selectDistinctOn([academicTerms.startsAt, courseOfferings.id], {
        offeringId: courseOfferings.id,
        courseTitle: courses.title,
        courseCode: courses.code,
        termName: academicTerms.name,
        startsAt: academicTerms.startsAt,
        departmentId: orgUnits.id,
        departmentCode: orgUnits.code,
        departmentName: orgUnits.name,
      })
      .from(teachingAssignments)
      .innerJoin(courseOfferings, eq(courseOfferings.id, teachingAssignments.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .leftJoin(orgUnits, and(eq(orgUnits.id, courses.orgUnitId), isNull(orgUnits.deletedAt)))
      .where(
        and(
          eq(teachingAssignments.institutionId, institutionId),
          eq(teachingAssignments.userId, teacherId),
          isNull(teachingAssignments.deletedAt),
          isNull(courseOfferings.deletedAt),
          isNull(courses.deletedAt),
        ),
      )
      .orderBy(desc(academicTerms.startsAt), courseOfferings.id)
      .limit(MAX_OFFERINGS);

    return rows;
  }

  private async openableBy(
    institutionId: string,
    viewerId: string,
    offeringIds: string[],
  ): Promise<(offeringId: string) => boolean> {
    if (await administersOfferings(this.authorization, viewerId, institutionId)) {
      return () => true;
    }

    const [teaches, enrolled] = await Promise.all([
      this.reader
        .select({ offeringId: teachingAssignments.courseOfferingId })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.userId, viewerId),
            inArray(teachingAssignments.courseOfferingId, offeringIds),
            isNull(teachingAssignments.deletedAt),
          ),
        ),
      this.reader
        .select({ offeringId: enrollments.courseOfferingId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.userId, viewerId),
            inArray(enrollments.courseOfferingId, offeringIds),
            inArray(enrollments.status, [...ENROLLMENT_RECORDED_STATUSES]),
            isNull(enrollments.deletedAt),
          ),
        ),
    ]);
    const open = new Set([...teaches, ...enrolled].map((row) => row.offeringId));

    return (offeringId) => open.has(offeringId);
  }

  private get reader() {
    return this.txHost.reader();
  }
}

function distinctDepartments(
  rows: {
    departmentId: string | null;
    departmentCode: string | null;
    departmentName: string | null;
  }[],
): TeacherDepartment[] {
  const byId = new Map<string, TeacherDepartment>();
  for (const row of rows) {
    if (
      row.departmentId === null ||
      row.departmentCode === null ||
      row.departmentName === null
    ) {
      continue;
    }
    byId.set(row.departmentId, {
      id: row.departmentId,
      code: row.departmentCode,
      name: row.departmentName,
    });
  }

  return [...byId.values()];
}
