import { Injectable } from '@nestjs/common';
import { and, asc, eq, exists, gte, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  examRegistrations,
  examTerms,
  rooms,
  teachingAssignments,
  users,
  type ExamRegistrationStatus,
  type ExamTermKind,
  type SourceSystem,
  type SynchronizationStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface MyExamTermRow {
  examTermId: string;
  kind: ExamTermKind;
  startsAt: Date;
  endsAt: Date | null;
  capacity: number | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  cancelledAt: Date | null;
  teaching: boolean;
  registeredCount: number;
  roomId: string | null;
  roomCode: string | null;
  roomName: string | null;
  roomBuilding: string | null;
  examinerId: string | null;
  examinerDisplayName: string | null;
  registrationId: string | null;
  registrationStatus: ExamRegistrationStatus | null;
  registeredAt: Date | null;
  registrationCancelledAt: Date | null;
  offeringId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  termId: string;
  termCode: string;
  termName: string;
  sourceSystem: SourceSystem;
  externalId: string | null;
  sourceUpdatedAt: Date | null;
  lastSynchronizedAt: Date | null;
  synchronizationStatus: SynchronizationStatus;
}

export interface MyExamTermFilter {
  from?: Date;
  to?: Date;
  offeringId?: string;
  kind?: ExamTermKind;
}

@Injectable()
export class MyExamTermsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findMyExamTerms(
    institutionId: string,
    userId: string,
    filter: MyExamTermFilter,
  ): Promise<MyExamTermRow[]> {
    const teaches = this.teaches(userId);
    const conditions: (SQL | undefined)[] = [
      eq(examTerms.institutionId, institutionId),
      isNull(examTerms.deletedAt),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      isNull(academicTerms.deletedAt),
      or(this.attends(userId), teaches),
    ];

    if (filter.from) conditions.push(gte(examTerms.startsAt, filter.from));
    if (filter.to) conditions.push(lt(examTerms.startsAt, filter.to));
    if (filter.offeringId) conditions.push(eq(courseOfferings.id, filter.offeringId));
    if (filter.kind) conditions.push(eq(examTerms.kind, filter.kind));

    return this.reader
      .select({
        examTermId: examTerms.id,
        kind: examTerms.kind,
        startsAt: examTerms.startsAt,
        endsAt: examTerms.endsAt,
        capacity: examTerms.capacity,
        registrationOpensAt: examTerms.registrationOpensAt,
        registrationClosesAt: examTerms.registrationClosesAt,
        cancelledAt: examTerms.cancelledAt,
        teaching: sql<boolean>`${teaches}`.mapWith(Boolean),
        registeredCount: this.registeredCount(),
        roomId: rooms.id,
        roomCode: rooms.code,
        roomName: rooms.name,
        roomBuilding: rooms.building,
        examinerId: users.id,
        examinerDisplayName: users.displayName,
        registrationId: examRegistrations.id,
        registrationStatus: examRegistrations.status,
        registeredAt: examRegistrations.registeredAt,
        registrationCancelledAt: examRegistrations.cancelledAt,
        offeringId: courseOfferings.id,
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        termId: academicTerms.id,
        termCode: academicTerms.code,
        termName: academicTerms.name,
        sourceSystem: examTerms.sourceSystem,
        externalId: examTerms.externalId,
        sourceUpdatedAt: examTerms.sourceUpdatedAt,
        lastSynchronizedAt: examTerms.lastSynchronizedAt,
        synchronizationStatus: examTerms.synchronizationStatus,
      })
      .from(examTerms)
      .innerJoin(courseOfferings, eq(courseOfferings.id, examTerms.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .leftJoin(rooms, and(eq(rooms.id, examTerms.roomId), isNull(rooms.deletedAt)))
      .leftJoin(users, and(eq(users.id, examTerms.examinerId), isNull(users.deletedAt)))
      .leftJoin(
        examRegistrations,
        and(
          eq(examRegistrations.examTermId, examTerms.id),
          eq(examRegistrations.userId, userId),
          isNull(examRegistrations.deletedAt),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(examTerms.startsAt), asc(courses.code));
  }

  private registeredCount(): SQL<number> {
    return sql<number>`(
      select count(*) from ${examRegistrations}
      where ${examRegistrations.examTermId} = ${examTerms.id}
        and ${examRegistrations.status} = 'registered'
        and ${examRegistrations.deletedAt} is null
    )`.mapWith(Number);
  }

  private attends(userId: string): SQL {
    return exists(
      this.reader
        .select({ one: sql`1` })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseOfferingId, courseOfferings.id),
            eq(enrollments.userId, userId),
            isNull(enrollments.deletedAt),
          ),
        ),
    );
  }

  private teaches(userId: string): SQL {
    return exists(
      this.reader
        .select({ one: sql`1` })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.courseOfferingId, courseOfferings.id),
            eq(teachingAssignments.userId, userId),
            isNull(teachingAssignments.deletedAt),
          ),
        ),
    );
  }

  private get reader() {
    return this.txHost.reader();
  }
}
