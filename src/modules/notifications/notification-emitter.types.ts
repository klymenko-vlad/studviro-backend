import type { NotificationPayload, NotificationType } from '../../database/schema';
import type { SyncTarget } from '../synchronization/sync.types';

export interface NotificationEmission {
  readonly target: SyncTarget;
  readonly type: NotificationType;
  readonly subjectId: string;
  readonly courseOfferingId: string | null;
  readonly examTermId: string | null;
  readonly payload: NotificationPayload;
  readonly occurredAt: Date;
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
