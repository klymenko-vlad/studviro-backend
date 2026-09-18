import { Injectable } from '@nestjs/common';
import { and, asc, eq, exists, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  examRegistrations,
  examTerms,
  FAILING_COURSE_GRADES,
  officialCourseResults,
  rooms,
  sourceWriteIntents,
  teachingAssignments,
  users,
  VOIDED_COURSE_RESULT_STATUSES,
  type ExamRegistrationStatus,
  type ExamTermKind,
  type SourceSystem,
  type SourceWriteIntentState,
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
  otherLiveRegistrationForOffering: boolean;
  attemptsSpent: number;
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
  registrationDeliveryState: SourceWriteIntentState | null;
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
        otherLiveRegistrationForOffering:
          sql<boolean>`${this.registeredElsewhere(userId)}`.mapWith(Boolean),
        attemptsSpent: this.attemptsSpent(userId),
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
        registrationDeliveryState: this.deliveryState(),
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
        // The newest row wins: a cancellation is kept beside the registration it
        // reverses, so the join has to say which of the two it means.
        eq(examRegistrations.id, this.latestRegistrationId(userId)),
      )
      .where(and(...conditions))
      .orderBy(asc(examTerms.startsAt), asc(courses.code));
  }

  /** The same count the write enforces the retake ladder on. */
  private attemptsSpent(userId: string): SQL<number> {
    return sql<number>`(
      select count(*) from ${officialCourseResults}
      inner join ${enrollments} on ${enrollments.id} = ${officialCourseResults.enrollmentId}
      where ${enrollments.userId} = ${userId}
        and ${enrollments.courseOfferingId} = ${courseOfferings.id}
        and ${enrollments.deletedAt} is null
        and ${officialCourseResults.deletedAt} is null
        and ${officialCourseResults.status} not in ${VOIDED_COURSE_RESULT_STATUSES}
        and ${officialCourseResults.officialGrade} in ${FAILING_COURSE_GRADES}
    )`.mapWith(Number);
  }

  private latestRegistrationId(userId: string): SQL<string> {
    return sql<string>`(
      select inner_registration.id from ${examRegistrations} as inner_registration
      where inner_registration.exam_term_id = ${examTerms.id}
        and inner_registration.user_id = ${userId}
        and inner_registration.deleted_at is null
      order by inner_registration.registered_at desc nulls last, inner_registration.created_at desc
      limit 1
    )`;
  }

  /**
   * How far the student's own act has got towards the university's system. The
   * newest intent wins: a cancel queued behind its registration is what the
   * student is waiting on now.
   */
  private deliveryState(): SQL<SourceWriteIntentState | null> {
    return sql<SourceWriteIntentState | null>`(
      select ${sourceWriteIntents.state} from ${sourceWriteIntents}
      where ${sourceWriteIntents.canonicalId} = ${examRegistrations.id}
        and ${sourceWriteIntents.deletedAt} is null
      order by ${sourceWriteIntents.createdAt} desc
      limit 1
    )`;
  }

  private registeredCount(): SQL<number> {
    return sql<number>`(
      select count(*) from ${examRegistrations}
      where ${examRegistrations.examTermId} = ${examTerms.id}
        and ${examRegistrations.status} = 'registered'
        and ${examRegistrations.deletedAt} is null
    )`.mapWith(Number);
  }

  /**
   * A student may hold only one live registration per course offering, so a free seat on
   * a sibling term is still unreachable. Nothing in the window, the capacity or the
   * caller's own registration on *this* term says so — only this does.
   */
  private registeredElsewhere(userId: string): SQL {
    return sql`exists (
      select 1 from ${examRegistrations}
      inner join ${examTerms} as sibling on sibling.id = ${examRegistrations.examTermId}
      where ${examRegistrations.userId} = ${userId}
        and ${examRegistrations.status} = 'registered'
        and ${examRegistrations.deletedAt} is null
        and sibling.deleted_at is null
        and sibling.course_offering_id = ${courseOfferings.id}
        and sibling.id <> ${examTerms.id}
    )`;
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
            inArray(enrollments.status, ENROLLMENT_RECORDED_STATUSES),
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
