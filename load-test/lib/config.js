/**
 * Everything the university-day profile needs from outside itself.
 *
 * Defaults describe the demo university `pnpm db:seed` writes: 144 students,
 * one institution, an academic term whose enrolment window is open.
 */
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3010';

export const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@studviro.local';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'correct horse battery staple';
export const STUDENT_PASSWORD = __ENV.STUDENT_PASSWORD || 'correct horse battery staple';

export const INSTITUTION_ID = __ENV.INSTITUTION_ID || '';

/** How many students take part. The seed writes 144. */
export const STUDENTS = Number(__ENV.STUDENTS || 144);

/** Seats on the offering everybody rushes. Fewer than STUDENTS, deliberately. */
export const ENROLLMENT_SEATS = Number(__ENV.ENROLLMENT_SEATS || 40);

/** Seats on the exam term everybody rushes. Fewer than ENROLLMENT_SEATS. */
export const EXAM_SEATS = Number(__ENV.EXAM_SEATS || 25);

/** Nobody clicks at the same millisecond; spread the herd over this long. */
export const RUSH_JITTER_SECONDS = Number(__ENV.RUSH_JITTER_SECONDS || 3);

/** Arrivals per second at the peak of the results-evening scenario. */
export const BROWSE_PEAK_RATE = Number(__ENV.BROWSE_PEAK_RATE || 12);

export const API = `${BASE_URL}/api/v1`;
