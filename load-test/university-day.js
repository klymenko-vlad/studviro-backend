import { check, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';

import { get, post, errorCode } from './lib/client.js';
import { signIn } from './lib/auth.js';
import {
  API,
  BROWSE_PEAK_RATE,
  RUSH_JITTER_SECONDS,
  STUDENTS,
  STUDENT_PASSWORD,
} from './lib/config.js';
import { buildFixture } from './lib/fixtures.js';
import {
  capacityRespected,
  enrollmentDuration,
  examRegistrationDuration,
  examSeatsGranted,
  examSeatsRefused,
  enrollmentConflicts,
  examConflicts,
  seatsGranted,
  seatsRefused,
} from './lib/metrics.js';

/**
 * A university's load is spiky and correlated, not a uniform RPS. Three
 * moments carry almost all of it, and each breaks the system differently:
 *
 *   results evening   — everybody signs in at once and reads the same screens
 *   enrolment rush    — everybody asks for the same seats in the same minute
 *   exam registration — the same, against a smaller room
 *
 * They overlap here on purpose: the two rushes land inside the browsing wave,
 * because in a real term they do.
 *
 *   k6 run -e BASE_URL=http://localhost:3010 load-test/university-day.js
 *
 * The per-IP rate limiter has to be raised for the run — every request comes
 * from one address. See docs/Performance.md.
 */

// 400, 404 and 409 are answers this profile asks for. Only a broken response
// should count towards http_req_failed.
http.setResponseCallback(http.expectedStatuses(200, 201, 204, 400, 404, 409));

export const options = {
  setupTimeout: '5m',
  scenarios: {
    results_evening: {
      executor: 'ramping-arrival-rate',
      exec: 'resultsEvening',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 40,
      maxVUs: 150,
      stages: [
        { target: 2, duration: '30s' },
        { target: BROWSE_PEAK_RATE, duration: '1m' },
        { target: BROWSE_PEAK_RATE, duration: '2m' },
        { target: 2, duration: '1m' },
      ],
    },
    enrollment_rush: {
      executor: 'per-vu-iterations',
      exec: 'enrollmentRush',
      startTime: '90s',
      vus: STUDENTS,
      iterations: 1,
      maxDuration: '2m',
    },
    exam_rush: {
      executor: 'per-vu-iterations',
      exec: 'examRush',
      startTime: '200s',
      vus: STUDENTS,
      iterations: 1,
      maxDuration: '2m',
    },
  },
  thresholds: {
    // Straight from docs/Observability.md: p95 above 1s raises a ticket, p99
    // above 5s pages. A load test that tolerates more than the alerts do is
    // measuring nothing.
    'http_req_duration{scenario:results_evening}': ['p(95)<1000', 'p(99)<5000'],
    // The two rush writes get three times the read budget and no more. A
    // herd of 144 serialisable transactions queues on a pool of ten, so the
    // wait is real; past 5s REQUEST_TIMEOUT_MS is the next thing that happens.
    enrollment_request_duration: ['p(95)<3000', 'p(99)<5000'],
    exam_registration_duration: ['p(95)<3000', 'p(99)<5000'],
    // Observability alerts on a 5xx ratio over 1%. So does this.
    server_errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
    // A status this profile has no name for is a behaviour change, not slowness.
    unexpected_status: ['rate==0'],
    checks: ['rate==1.00'],
    // The point of the rush: the seat count held after it must be the seat
    // count offered before it.
    capacity_respected: ['rate==1.00'],
    // argon2id is deliberately expensive. It still must not be the thing that
    // makes signing in feel broken.
    sign_in_duration: ['p(95)<2000'],
    // A serialisable transaction under a thundering herd loses some races, and
    // nothing retries them for the student. Today that is about a third of the
    // herd; the ceiling is here so a change that turns the whole rush into
    // conflicts fails the run instead of being discovered in September.
    enrollment_serialization_conflicts: ['rate<0.50'],
    exam_serialization_conflicts: ['rate<0.50'],
  },
};

export function setup() {
  return buildFixture();
}

/** A student signs in and reads the screens they read the evening marks land. */
export function resultsEvening(data) {
  const student = data.students[exec.scenario.iterationInTest % data.students.length];
  const token = signIn(student.email, STUDENT_PASSWORD) || student.token;
  const base = `${API}/institutions/${data.institutionId}`;

  check(get(`${API}/auth/me`, token), { 'me is 200': (r) => r.status === 200 });
  get(`${base}/me/permissions`, token);
  get(`${base}/me/courses`, token);
  get(`${base}/me/course-results/summary`, token);
  get(`${base}/me/course-results`, token);
  get(`${base}/me/timetable-events?${thisWeek()}`, token);
  get(`${base}/me/notifications/unread-count`, token);

  sleep(1);
}

/** Everybody asks for the same seats in the same five minutes. */
export function enrollmentRush(data) {
  const student = data.students[exec.scenario.iterationInTest % data.students.length];
  sleep(Math.random() * RUSH_JITTER_SECONDS);

  const base = `${API}/institutions/${data.institutionId}`;
  get(`${base}/me/enrollments/enrollable?termId=${data.termId}`, student.token);

  const response = post(
    `${base}/me/enrollments`,
    student.token,
    { courseOfferingId: data.offeringId },
    [201, 400, 409],
  );
  enrollmentDuration.add(response.timings.duration);

  recordSeat(response, seatsGranted, seatsRefused, enrollmentConflicts, ['OFFERING_FULL']);
}

/** Registration opens; the same herd, a smaller room. */
export function examRush(data) {
  const student = data.students[exec.scenario.iterationInTest % data.students.length];
  sleep(Math.random() * RUSH_JITTER_SECONDS);

  const base = `${API}/institutions/${data.institutionId}`;
  const mine = get(`${base}/me/exam-terms?offeringId=${data.offeringId}`, student.token).json();

  // A student who lost the enrolment rush is not in the course, so the term is
  // not theirs to register for. They still load the screen, which is the point.
  const term = mine.find((t) => t.id === data.examTermId);
  if (!term || !term.registrationAvailability.canRegister) return;

  const response = post(
    `${base}/me/exam-registrations`,
    student.token,
    { examTermId: data.examTermId },
    [201, 400, 409],
  );
  examRegistrationDuration.add(response.timings.duration);

  recordSeat(response, examSeatsGranted, examSeatsRefused, examConflicts, [
    'EXAM_TERM_FULL',
    'EXAM_TERM_NOT_ENROLLED',
  ]);
}

export function teardown(data) {
  const base = `${API}/institutions/${data.institutionId}`;

  const offering = get(`${base}/course-offerings`, data.adminToken)
    .json()
    .find((item) => item.id === data.offeringId);
  capacityRespected.add(Boolean(offering) && offering.enrolled <= offering.capacity);

  const examTerm = get(
    `${base}/course-offerings/${data.offeringId}/exam-terms`,
    data.adminToken,
  )
    .json()
    .find((item) => item.id === data.examTermId);
  capacityRespected.add(Boolean(examTerm) && examTerm.seatsTaken <= examTerm.capacity);

  console.log(
    `rush offering: ${offering ? offering.enrolled : '?'}/${offering ? offering.capacity : '?'} seats held`,
  );
  console.log(
    `rush exam term: ${examTerm ? examTerm.seatsTaken : '?'}/${examTerm ? examTerm.capacity : '?'} seats held`,
  );
}

/** The week calendar asks for a window, so a realistic read has to carry one. */
function thisWeek() {
  const from = new Date();
  const to = new Date(from.getTime() + 7 * 86_400_000);

  return `from=${from.toISOString()}&to=${to.toISOString()}`;
}

function recordSeat(response, granted, refused, conflicts, expectedRefusals) {
  if (response.status === 201) {
    granted.add(1);
    conflicts.add(false);
    return;
  }

  const code = errorCode(response);
  if (code === 'SERIALIZATION_FAILURE' || code === 'LOCK_NOT_AVAILABLE') {
    conflicts.add(true);
    return;
  }

  conflicts.add(false);
  refused.add(1);
  check(response, {
    'refusal is one the domain names': () => expectedRefusals.includes(code),
  });
}
