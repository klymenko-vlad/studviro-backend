import { fail } from 'k6';

import { signIn } from './auth.js';
import { call, get, post } from './client.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API,
  ENROLLMENT_SEATS,
  EXAM_SEATS,
  INSTITUTION_ID,
  STUDENTS,
  STUDENT_PASSWORD,
} from './config.js';

const DAY_MS = 86_400_000;

/**
 * Builds the thing everybody rushes.
 *
 * A rush has to land on a course nobody is on yet and an exam term whose
 * registration has just opened, and the demo seed has neither: its exam terms
 * all sit outside their registration window. So the fixture is created through
 * the same API an administrator uses, which is also the only way to be sure
 * the seat count is exactly the one the assertions expect.
 *
 * `clearFixture` takes it back off the timetable when the run ends.
 */
export function buildFixture() {
  const adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!adminToken) fail(`could not sign in as ${ADMIN_EMAIL}`);

  const institutionId = INSTITUTION_ID || firstInstitution(adminToken);
  const term = openEnrollmentTerm(adminToken, institutionId);
  const orgUnitId = anyOrgUnit(adminToken, institutionId);

  const offeringId = createRushOffering(adminToken, institutionId, term.id, orgUnitId);
  const examTermId = createRushExamTerm(adminToken, institutionId, offeringId);
  const students = signInStudents(adminToken, institutionId);

  return { adminToken, institutionId, termId: term.id, offeringId, examTermId, students };
}

function firstInstitution(token) {
  const institutions = get(`${API}/institutions`, token).json();
  if (!institutions.length) fail('no institution to test against — run pnpm db:seed');

  return institutions[0].id;
}

function openEnrollmentTerm(token, institutionId) {
  const now = Date.now();
  const terms = get(`${API}/institutions/${institutionId}/academic-terms`, token).json();
  const open = terms.find(
    (t) =>
      t.enrollmentOpensAt &&
      t.enrollmentClosesAt &&
      Date.parse(t.enrollmentOpensAt) <= now &&
      Date.parse(t.enrollmentClosesAt) > now,
  );

  if (!open) fail('no academic term has an open enrolment window — move the seed anchor');

  return open;
}

function anyOrgUnit(token, institutionId) {
  const units = get(`${API}/institutions/${institutionId}/org-units`, token).json();
  const department = units.find((u) => u.type === 'department') || units[0];
  if (!department) fail('no org unit to hang the rush course off');

  return department.id;
}

function createRushOffering(token, institutionId, academicTermId, orgUnitId) {
  const suffix = `${Date.now()}`.slice(-9);
  const course = post(
    `${API}/institutions/${institutionId}/courses`,
    token,
    {
      code: `LOAD-RUSH-${suffix}`,
      title: 'Load test: the course everybody wants',
      credits: 6,
      orgUnitId,
    },
    [201],
  );
  if (course.status !== 201) fail(`could not create the rush course: ${course.body}`);

  const offering = post(
    `${API}/institutions/${institutionId}/course-offerings`,
    token,
    {
      courseId: course.json('id'),
      academicTermId,
      capacity: ENROLLMENT_SEATS,
      status: 'open',
    },
    [201],
  );
  if (offering.status !== 201) fail(`could not create the rush offering: ${offering.body}`);

  return offering.json('id');
}

function createRushExamTerm(token, institutionId, offeringId) {
  const now = Date.now();
  const examTerm = post(
    `${API}/institutions/${institutionId}/course-offerings/${offeringId}/exam-terms`,
    token,
    {
      kind: 'regular',
      startsAt: new Date(now + 30 * DAY_MS).toISOString(),
      endsAt: new Date(now + 30 * DAY_MS + 7_200_000).toISOString(),
      capacity: EXAM_SEATS,
      registrationOpensAt: new Date(now - 3_600_000).toISOString(),
      registrationClosesAt: new Date(now + 7 * DAY_MS).toISOString(),
    },
    [201],
  );
  if (examTerm.status !== 201) fail(`could not create the rush exam term: ${examTerm.body}`);

  return examTerm.json('id');
}

function signInStudents(adminToken, institutionId) {
  const emails = studentEmails(adminToken, institutionId);

  if (!emails.length) fail('no students in the institution — run pnpm db:seed');

  const students = [];
  for (const email of emails) {
    const token = signIn(email, STUDENT_PASSWORD);
    if (token) students.push({ email, token });
  }

  if (!students.length) fail('no student could sign in — check STUDENT_PASSWORD');

  return students;
}

function studentEmails(adminToken, institutionId) {
  const emails = [];
  let cursor = null;

  do {
    const query =
      cursor === null ? 'limit=100' : `limit=100&cursor=${encodeURIComponent(cursor)}`;
    const page = get(`${API}/institutions/${institutionId}/people?${query}`, adminToken).json();

    for (const person of page.items) {
      if (person.status !== 'active') continue;
      if (!person.roles.some((role) => role.role === 'student')) continue;
      emails.push(person.email);
    }

    cursor = page.meta.hasNextPage ? page.meta.nextCursor : null;
  } while (cursor !== null && emails.length < STUDENTS);

  return emails.slice(0, STUDENTS);
}

/**
 * Takes the rush back off the timetable through the verbs an administrator
 * has. An offering students held places on can only be cancelled, never
 * erased, so the course stays in the catalogue as a cancelled offering; the
 * exam term is removed outright, which releases every seat it held.
 */
export function clearFixture(data) {
  const base = `${API}/institutions/${data.institutionId}/course-offerings/${data.offeringId}`;

  const examTerm = call('DELETE', `${base}/exam-terms/${data.examTermId}`, {
    token: data.adminToken,
    expect: [204],
  });
  const offering = call('PATCH', base, {
    token: data.adminToken,
    body: { status: 'cancelled' },
    expect: [200],
  });

  return examTerm.status === 204 && offering.status === 200;
}
