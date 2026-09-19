import { eq, inArray, like } from 'drizzle-orm';

import type { Database } from '../database.tokens';
import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  examTerms,
  institutions,
  institutionSettings,
  officialCourseResults,
  orgUnits,
  programMemberships,
  programs,
  roleAssignments,
  rooms,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
  timetableEvents,
  users,
} from '../schema';

import {
  planEnrollments,
  planExamTerms,
  planOfferings,
  planResults,
  planStudyGroups,
  planTimetableEvents,
} from './derive';
import type { DemoSeedOptions } from './options';
import { allCourses, allDepartments, allPersons, allPrograms, allRooms } from './plan';
import type { DemoPlan } from './plan';

export type SeedDatabase = Database;

/**
 * Accounts a person opening the demo is told about. Each one is layered onto a
 * generated person so it has a real place in the university rather than an
 * empty dashboard: the student is a student of a programme, the teacher teaches
 * the courses their department owns.
 */
export interface NamedAccounts {
  readonly adminEmail: string;
  readonly registrarEmail: string;
  readonly teacherEmail: string;
  readonly studentEmail: string;
}

export const DEFAULT_NAMED_ACCOUNTS: NamedAccounts = {
  adminEmail: 'admin@studviro.local',
  registrarEmail: 'registrar@studviro.local',
  teacherEmail: 'teacher@studviro.local',
  studentEmail: 'ada@studviro.local',
};

export interface SeedSummary {
  readonly institutionId: string;
  readonly counts: Readonly<Record<string, number>>;
}

/** Postgres caps a statement's bind parameters; insert in slices well under it. */
const CHUNK = 400;

async function insertChunked<TRow>(
  rows: readonly TRow[],
  insert: (slice: TRow[]) => Promise<unknown>,
): Promise<number> {
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    await insert(rows.slice(offset, offset + CHUNK));
  }

  return rows.length;
}

/**
 * Writes the planned university as canonical rows, in dependency order.
 *
 * **Destructive, and only for what it owns.** The institution with this code is
 * hard-deleted first and the delete cascades through every institution-scoped
 * table, so a re-run replaces the demo rather than doubling it. Accounts on the
 * generated email domain go with it. Nothing outside that institution is
 * touched — the named accounts are updated in place, never deleted, because a
 * real person may have changed their password on them.
 */
export async function writePlan(
  db: SeedDatabase,
  plan: DemoPlan,
  options: DemoSeedOptions,
  passwordHash: string,
  accounts: NamedAccounts = DEFAULT_NAMED_ACCOUNTS,
): Promise<SeedSummary> {
  await db.delete(institutions).where(eq(institutions.code, plan.university.code));
  await db.delete(users).where(like(users.email, `%@${options.emailDomain}`));

  const [institution] = await db
    .insert(institutions)
    .values({
      code: plan.university.code,
      name: plan.university.name,
      defaultLocale: 'en',
      timezone: 'Europe/Bratislava',
    })
    .returning({ id: institutions.id });
  if (!institution) throw new Error('failed to create the demo institution');

  const institutionId = institution.id;
  await db.insert(institutionSettings).values({ institutionId });

  // --- org units -----------------------------------------------------------
  const orgUnitIds = new Map<string, string>();

  const [university] = await db
    .insert(orgUnits)
    .values({
      institutionId,
      parentId: null,
      type: 'university',
      code: plan.university.code,
      name: plan.university.name,
    })
    .returning({ id: orgUnits.id });
  if (!university) throw new Error('failed to create the university org unit');
  orgUnitIds.set(plan.university.key, university.id);

  const facultyRows = await db
    .insert(orgUnits)
    .values(
      plan.faculties.map((faculty) => ({
        institutionId,
        parentId: university.id,
        type: 'faculty' as const,
        code: faculty.code,
        name: faculty.name,
      })),
    )
    .returning({ id: orgUnits.id, code: orgUnits.code });
  for (const faculty of plan.faculties) {
    const row = facultyRows.find((candidate) => candidate.code === faculty.code);
    if (row) orgUnitIds.set(faculty.key, row.id);
  }

  const departments = allDepartments(plan);
  const departmentRows = await db
    .insert(orgUnits)
    .values(
      departments.map((department) => ({
        institutionId,
        parentId: orgUnitIds.get(department.facultyKey) ?? null,
        type: 'department' as const,
        code: department.code,
        name: department.name,
      })),
    )
    .returning({ id: orgUnits.id, code: orgUnits.code });
  for (const department of departments) {
    const row = departmentRows.find((candidate) => candidate.code === department.code);
    if (row) orgUnitIds.set(department.key, row.id);
  }

  // --- rooms ---------------------------------------------------------------
  const plannedRooms = allRooms(plan);
  const roomRows = await db
    .insert(rooms)
    .values(
      plannedRooms.map((room) => ({
        institutionId,
        orgUnitId: orgUnitIds.get(room.facultyKey) ?? null,
        code: room.code,
        building: room.building,
        capacity: room.capacity,
      })),
    )
    .returning({ id: rooms.id, code: rooms.code });
  const roomIds = keyIdMap(plannedRooms, roomRows, (room) => room.code);

  // --- terms ---------------------------------------------------------------
  const termRows = await db
    .insert(academicTerms)
    .values(
      plan.terms.map((term) => ({
        institutionId,
        code: term.code,
        name: term.name,
        kind: term.kind,
        academicYear: term.academicYear,
        startsAt: term.startsAt,
        endsAt: term.endsAt,
        enrollmentOpensAt: term.enrollmentOpensAt,
        enrollmentClosesAt: term.enrollmentClosesAt,
      })),
    )
    .returning({ id: academicTerms.id, code: academicTerms.code });
  const termIds = keyIdMap(plan.terms, termRows, (term) => term.code);

  // --- programmes and courses ---------------------------------------------
  const plannedPrograms = allPrograms(plan);
  const programRows = await db
    .insert(programs)
    .values(
      plannedPrograms.map((program) => ({
        institutionId,
        orgUnitId: orgUnitIds.get(program.facultyKey) ?? null,
        code: program.code,
        name: program.name,
        degreeLevel: 'bachelor' as const,
        studyForm: 'full_time' as const,
        standardLengthSemesters: program.standardLengthSemesters,
      })),
    )
    .returning({ id: programs.id, code: programs.code });
  const programIds = keyIdMap(plannedPrograms, programRows, (program) => program.code);

  const plannedCourses = allCourses(plan);
  const courseIds = new Map<string, string>();
  for (let offset = 0; offset < plannedCourses.length; offset += CHUNK) {
    const slice = plannedCourses.slice(offset, offset + CHUNK);
    const inserted = await db
      .insert(courses)
      .values(
        slice.map((course) => ({
          institutionId,
          orgUnitId: orgUnitIds.get(course.departmentKey) ?? null,
          code: course.code,
          title: course.title,
          credits: course.credits.toFixed(2),
        })),
      )
      .returning({ id: courses.id, code: courses.code });
    for (const course of slice) {
      const row = inserted.find((candidate) => candidate.code === course.code);
      if (row) courseIds.set(course.key, row.id);
    }
  }

  // --- people --------------------------------------------------------------
  const aliases = namedAliases(plan, accounts);
  const plannedPersons = allPersons(plan);
  const personIds = new Map<string, string>();

  for (const [personKey, email] of aliases) {
    personIds.set(
      personKey,
      await upsertUser(db, email, displayNameFor(plan, personKey), passwordHash),
    );
  }

  const generated = plannedPersons.filter((person) => !aliases.has(person.key));
  for (let offset = 0; offset < generated.length; offset += CHUNK) {
    const slice = generated.slice(offset, offset + CHUNK);
    const inserted = await db
      .insert(users)
      .values(
        slice.map((person) => ({
          email: person.email,
          displayName: `${person.givenName} ${person.familyName}`,
          passwordHash,
          role: 'user' as const,
          status: 'active' as const,
        })),
      )
      .returning({ id: users.id, email: users.email });
    for (const person of slice) {
      const row = inserted.find((candidate) => candidate.email === person.email);
      if (row) personIds.set(person.key, row.id);
    }
  }

  const adminId = await upsertUser(
    db,
    accounts.adminEmail,
    'Studviro Admin',
    passwordHash,
    'admin',
  );
  const registrarId = await upsertUser(
    db,
    accounts.registrarEmail,
    'Demo Registrar',
    passwordHash,
  );

  await db.insert(roleAssignments).values([
    {
      institutionId,
      userId: adminId,
      role: 'institution_admin' as const,
      scopeType: 'institution' as const,
      scopeId: null,
    },
    {
      institutionId,
      userId: registrarId,
      role: 'registrar' as const,
      scopeType: 'institution' as const,
      scopeId: null,
    },
  ]);

  // --- programme memberships ----------------------------------------------
  const memberships = plannedPrograms.flatMap((program) =>
    program.students.map((student) => ({
      institutionId,
      programId: required(programIds, program.key, 'program'),
      userId: required(personIds, student.person.key, 'person'),
      status: 'active' as const,
      studyYear: student.studyYear,
      startedAt: plan.terms[0]?.startsAt ?? options.anchor,
    })),
  );
  await insertChunked(memberships, (slice) => db.insert(programMemberships).values(slice));

  // --- offerings and teaching ----------------------------------------------
  const plannedOfferings = planOfferings(plan, options.anchor);
  const offeringIds = new Map<string, string>();
  for (let offset = 0; offset < plannedOfferings.length; offset += CHUNK) {
    const slice = plannedOfferings.slice(offset, offset + CHUNK);
    const inserted = await db
      .insert(courseOfferings)
      .values(
        slice.map((offering) => ({
          institutionId,
          courseId: required(courseIds, offering.course.key, 'course'),
          academicTermId: required(termIds, offering.term.key, 'term'),
          orgUnitId: orgUnitIds.get(offering.course.departmentKey) ?? null,
          status: offering.status,
          language: 'sk',
          capacity: options.studentsPerProgram,
        })),
      )
      .returning({
        id: courseOfferings.id,
        courseId: courseOfferings.courseId,
        academicTermId: courseOfferings.academicTermId,
      });
    for (const offering of slice) {
      const courseId = required(courseIds, offering.course.key, 'course');
      const termId = required(termIds, offering.term.key, 'term');
      const row = inserted.find(
        (candidate) => candidate.courseId === courseId && candidate.academicTermId === termId,
      );
      if (row) offeringIds.set(offering.key, row.id);
    }
  }

  const teaching = plannedOfferings.flatMap((offering) =>
    offering.course.teachers.map((teacher, position) => ({
      institutionId,
      courseOfferingId: required(offeringIds, offering.key, 'offering'),
      userId: required(personIds, teacher.key, 'person'),
      role: position === 0 ? ('lecturer' as const) : ('seminar_leader' as const),
      isPrimary: position === 0,
    })),
  );
  await insertChunked(teaching, (slice) => db.insert(teachingAssignments).values(slice));

  // --- enrolments -----------------------------------------------------------
  const plannedEnrollments = planEnrollments(plannedOfferings, options.anchor);
  const enrollmentIds = new Map<string, string>();
  for (let offset = 0; offset < plannedEnrollments.length; offset += CHUNK) {
    const slice = plannedEnrollments.slice(offset, offset + CHUNK);
    const inserted = await db
      .insert(enrollments)
      .values(
        slice.map((enrollment) => ({
          institutionId,
          courseOfferingId: required(offeringIds, enrollment.offering.key, 'offering'),
          userId: required(personIds, enrollment.student.person.key, 'person'),
          programId: required(programIds, enrollment.offering.program.key, 'program'),
          status: enrollment.status,
          requirementType: 'compulsory' as const,
          attempt: 1,
          enrolledAt: enrollment.enrolledAt,
        })),
      )
      .returning({
        id: enrollments.id,
        courseOfferingId: enrollments.courseOfferingId,
        userId: enrollments.userId,
      });
    for (const enrollment of slice) {
      const offeringId = required(offeringIds, enrollment.offering.key, 'offering');
      const userId = required(personIds, enrollment.student.person.key, 'person');
      const row = inserted.find(
        (candidate) => candidate.courseOfferingId === offeringId && candidate.userId === userId,
      );
      if (row) enrollmentIds.set(enrollment.key, row.id);
    }
  }

  // --- study groups ---------------------------------------------------------
  const plannedGroups = planStudyGroups(plannedEnrollments);
  const groupIds = new Map<string, string>();
  for (let offset = 0; offset < plannedGroups.length; offset += CHUNK) {
    const slice = plannedGroups.slice(offset, offset + CHUNK);
    const inserted = await db
      .insert(studyGroups)
      .values(
        slice.map((group) => ({
          institutionId,
          courseOfferingId: required(offeringIds, group.offering.key, 'offering'),
          kind: 'seminar' as const,
          code: group.code,
          capacity: group.capacity,
        })),
      )
      .returning({
        id: studyGroups.id,
        courseOfferingId: studyGroups.courseOfferingId,
        code: studyGroups.code,
      });
    for (const group of slice) {
      const offeringId = required(offeringIds, group.offering.key, 'offering');
      const row = inserted.find(
        (candidate) =>
          candidate.courseOfferingId === offeringId && candidate.code === group.code,
      );
      if (row) groupIds.set(group.key, row.id);
    }
  }

  const groupMembers = plannedGroups.flatMap((group) =>
    group.memberKeys.map((memberKey) => ({
      institutionId,
      studyGroupId: required(groupIds, group.key, 'study group'),
      userId: required(personIds, memberKey, 'person'),
    })),
  );
  await insertChunked(groupMembers, (slice) => db.insert(studyGroupMemberships).values(slice));

  // --- timetable and exams --------------------------------------------------
  const events = planTimetableEvents(plannedOfferings, options).map((event) => ({
    institutionId,
    courseOfferingId: required(offeringIds, event.offering.key, 'offering'),
    studyGroupId: event.studyGroupKey ? (groupIds.get(event.studyGroupKey) ?? null) : null,
    roomId: roomIds.get(event.roomKey) ?? null,
    type: event.type,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  }));
  await insertChunked(events, (slice) => db.insert(timetableEvents).values(slice));

  const exams = planExamTerms(plannedOfferings, options).map((exam) => ({
    institutionId,
    courseOfferingId: required(offeringIds, exam.offering.key, 'offering'),
    roomId: roomIds.get(exam.roomKey) ?? null,
    examinerId: required(personIds, exam.examinerKey, 'person'),
    kind: exam.kind,
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
    capacity: exam.capacity,
    registrationOpensAt: exam.registrationOpensAt,
    registrationClosesAt: exam.registrationClosesAt,
  }));
  await insertChunked(exams, (slice) => db.insert(examTerms).values(slice));

  // --- results --------------------------------------------------------------
  const results = planResults(plannedEnrollments, options).map((result) => {
    const examiner = result.enrollment.offering.course.teachers[0];

    return {
      institutionId,
      enrollmentId: required(enrollmentIds, result.enrollment.key, 'enrollment'),
      status: 'official' as const,
      attempt: 1,
      officialGrade: result.grade,
      officialRecordedById: examiner ? (personIds.get(examiner.key) ?? null) : null,
      officialRecordedAt: result.recordedAt,
    };
  });
  await insertChunked(results, (slice) => db.insert(officialCourseResults).values(slice));

  return {
    institutionId,
    counts: {
      orgUnits: orgUnitIds.size,
      rooms: roomIds.size,
      academicTerms: termIds.size,
      programs: programIds.size,
      courses: courseIds.size,
      users: personIds.size + 2,
      programMemberships: memberships.length,
      courseOfferings: offeringIds.size,
      teachingAssignments: teaching.length,
      enrollments: enrollmentIds.size,
      studyGroups: groupIds.size,
      studyGroupMemberships: groupMembers.length,
      timetableEvents: events.length,
      examTerms: exams.length,
      officialCourseResults: results.length,
    },
  };
}

function keyIdMap<TPlanned extends { key: string }>(
  planned: readonly TPlanned[],
  rows: readonly { id: string; code: string }[],
  codeOf: (planned: TPlanned) => string,
): Map<string, string> {
  const ids = new Map<string, string>();

  for (const item of planned) {
    const row = rows.find((candidate) => candidate.code === codeOf(item));
    if (row) ids.set(item.key, row.id);
  }

  return ids;
}

function required(ids: ReadonlyMap<string, string>, key: string, what: string): string {
  const id = ids.get(key);
  if (!id) throw new Error(`the demo seed wrote no ${what} for ${key}`);

  return id;
}

/** Which generated person each named account stands in for. */
function namedAliases(plan: DemoPlan, accounts: NamedAccounts): Map<string, string> {
  const aliases = new Map<string, string>();
  const firstTeacher = allDepartments(plan)[0]?.teachers[0];
  const firstStudent = allPrograms(plan)[0]?.students[0];

  if (firstTeacher) aliases.set(firstTeacher.key, accounts.teacherEmail);
  if (firstStudent) aliases.set(firstStudent.person.key, accounts.studentEmail);

  return aliases;
}

function displayNameFor(plan: DemoPlan, personKey: string): string {
  const person = allPersons(plan).find((candidate) => candidate.key === personKey);

  return person ? `${person.givenName} ${person.familyName}` : personKey;
}

async function upsertUser(
  db: SeedDatabase,
  email: string,
  displayName: string,
  passwordHash: string,
  role: 'user' | 'admin' = 'user',
): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ displayName, role, status: 'active', deletedAt: null })
      .where(inArray(users.id, [existing.id]));

    return existing.id;
  }

  const [created] = await db
    .insert(users)
    .values({ email, displayName, passwordHash, role, status: 'active' })
    .returning({ id: users.id });
  if (!created) throw new Error(`failed to create ${email}`);

  return created.id;
}
