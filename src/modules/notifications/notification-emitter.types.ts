import type { NotificationPayload, NotificationType } from '../../database/schema';

/**
 * A change worth telling somebody about. Both sides may be null: a thing that
 * did not exist before was created, and a thing that has no `current` was
 * removed.
 */
export interface NotificationChange<TSubject> {
  readonly previous: TSubject | null;
  readonly current: TSubject | null;
  readonly removed?: boolean;
}

export interface NotificationEmission {
  readonly institutionId: string;
  readonly type: NotificationType;
  readonly subjectId: string;
  readonly courseOfferingId: string | null;
  readonly examTermId: string | null;
  readonly learningActivityId: string | null;
  readonly payload: NotificationPayload;
  readonly occurredAt: Date;
  /**
   * Who hears about it. Named explicitly for anything that concerns one person
   * — a grade, an enrolment outcome, your own registration — and left null for
   * an event about the offering itself, whose audience the emitter derives.
   */
  readonly recipients?: readonly string[];
  /**
   * An exam-term event reaches the people holding a seat and the examiner, not
   * everyone enrolled: a registered student and a classmate who never
   * registered do not have the same stake in the term moving.
   */
  readonly audience?: 'offering' | 'exam_term';
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function aggregationWindowOf(occurredAt: Date): string {
  return new Date(
    Math.floor(occurredAt.getTime() / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY,
  ).toISOString();
}

export function dedupeKeyOf(emission: NotificationEmission): string {
  return `${emission.type}:${emission.subjectId}:${aggregationWindowOf(emission.occurredAt)}`;
}
