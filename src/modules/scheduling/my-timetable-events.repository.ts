import { Injectable } from '@nestjs/common';
import { and, asc, eq, exists, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  rooms,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
  timetableEvents,
  type StudyGroupKind,
  type TimetableEventType,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface MyTimetableEventRow {
  eventId: string;
  type: TimetableEventType;
  title: string | null;
  startsAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
  teaching: boolean;
  roomId: string | null;
  roomCode: string | null;
  roomName: string | null;
  roomBuilding: string | null;
  studyGroupId: string | null;
  studyGroupCode: string | null;
  studyGroupName: string | null;
  studyGroupKind: StudyGroupKind | null;
  offeringId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  termId: string;
  termCode: string;
  termName: string;
}

export interface MyTimetableEventFilter {
  from: Date;
  to: Date;
  offeringId?: string;
  type?: TimetableEventType;
}

@Injectable()
export class MyTimetableEventsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findMyEvents(
    institutionId: string,
    userId: string,
    filter: MyTimetableEventFilter,
  ): Promise<MyTimetableEventRow[]> {
    const teaches = this.teaches(userId);
    const conditions: (SQL | undefined)[] = [
      eq(timetableEvents.institutionId, institutionId),
      isNull(timetableEvents.deletedAt),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      isNull(academicTerms.deletedAt),
      lt(timetableEvents.startsAt, filter.to),
      gt(timetableEvents.endsAt, filter.from),
      attendedBy(this.attends(userId), teaches, this.inStudyGroup(userId)),
    ];

    if (filter.offeringId) conditions.push(eq(courseOfferings.id, filter.offeringId));
    if (filter.type) conditions.push(eq(timetableEvents.type, filter.type));

    return this.reader
      .select({
        eventId: timetableEvents.id,
        type: timetableEvents.type,
        title: timetableEvents.title,
        startsAt: timetableEvents.startsAt,
        endsAt: timetableEvents.endsAt,
        cancelledAt: timetableEvents.cancelledAt,
        teaching: sql<boolean>`${teaches}`.mapWith(Boolean),
        roomId: rooms.id,
        roomCode: rooms.code,
        roomName: rooms.name,
        roomBuilding: rooms.building,
        studyGroupId: studyGroups.id,
        studyGroupCode: studyGroups.code,
        studyGroupName: studyGroups.name,
        studyGroupKind: studyGroups.kind,
        offeringId: courseOfferings.id,
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        termId: academicTerms.id,
        termCode: academicTerms.code,
        termName: academicTerms.name,
      })
      .from(timetableEvents)
      .innerJoin(courseOfferings, eq(courseOfferings.id, timetableEvents.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .leftJoin(rooms, and(eq(rooms.id, timetableEvents.roomId), isNull(rooms.deletedAt)))
      .leftJoin(
        studyGroups,
        and(eq(studyGroups.id, timetableEvents.studyGroupId), isNull(studyGroups.deletedAt)),
      )
      .where(and(...conditions))
      .orderBy(asc(timetableEvents.startsAt), asc(courses.code));
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

  private inStudyGroup(userId: string): SQL {
    return exists(
      this.reader
        .select({ one: sql`1` })
        .from(studyGroupMemberships)
        .where(
          and(
            eq(studyGroupMemberships.studyGroupId, timetableEvents.studyGroupId),
            eq(studyGroupMemberships.userId, userId),
            isNull(studyGroupMemberships.deletedAt),
          ),
        ),
    );
  }

  private get reader() {
    return this.txHost.reader();
  }
}

/**
 * A student sees a group event only as a member of that group; a teacher sees
 * every event of an offering they teach, group or not.
 */
const attendedBy = (attends: SQL, teaches: SQL, inStudyGroup: SQL): SQL | undefined =>
  or(and(attends, or(isNull(timetableEvents.studyGroupId), inStudyGroup)), teaches);
