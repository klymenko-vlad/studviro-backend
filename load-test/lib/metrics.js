import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * The numbers this profile is run to produce. Latency alone cannot tell a
 * seat granted from a seat refused, and a rush that quietly oversells is a
 * pass by every timing measure.
 */
export const serverErrors = new Rate('server_errors');
export const unexpectedStatus = new Rate('unexpected_status');

export const signInDuration = new Trend('sign_in_duration', true);
export const enrollmentDuration = new Trend('enrollment_request_duration', true);
export const examRegistrationDuration = new Trend('exam_registration_duration', true);

export const seatsGranted = new Counter('enrollment_seats_granted');
export const seatsRefused = new Counter('enrollment_seats_refused');
export const examSeatsGranted = new Counter('exam_seats_granted');
export const examSeatsRefused = new Counter('exam_seats_refused');

/**
 * A 409 the database forced, not a refusal the domain chose. Both are 409s and
 * only one of them means "no seat for you", so they are counted apart.
 */
export const enrollmentConflicts = new Rate('enrollment_serialization_conflicts');
export const examConflicts = new Rate('exam_serialization_conflicts');

/** Asserted after the rush: seats held never exceeded the capacity offered. */
export const capacityRespected = new Rate('capacity_respected');
