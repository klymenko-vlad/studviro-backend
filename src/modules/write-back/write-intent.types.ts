import type { SourceWriteIntentKind, SourceWriteIntent } from '../../database/schema';

export interface ExamRegistrationPayload extends Record<string, unknown> {
  readonly examTermExternalId: string;
  readonly personExternalId: string;
  readonly registrationExternalId: string | null;
}

export interface EnqueueWriteIntent {
  readonly institutionId: string;
  readonly targetSourceSystem: 'sis' | 'lms';
  readonly connectorName: string;
  readonly kind: SourceWriteIntentKind;
  readonly canonicalTable: string;
  readonly canonicalId: string;
  readonly payload: Record<string, unknown>;
  readonly actorId: string | null;
}

export type EnqueueOutcome =
  /** Queued, and the id the worker must be handed once the transaction commits. */
  | { readonly kind: 'queued'; readonly intentId: string }
  /**
   * The earlier intent was still pending, so the source never heard of it:
   * register-then-cancel collapses to nothing there.
   */
  | { readonly kind: 'collapsed' }
  /** No connector, or one that does not declare the capability. */
  | { readonly kind: 'not_writable' };

export interface WriteAcknowledgement {
  readonly externalId: string | null;
}

export interface IntentWriter {
  readonly kind: SourceWriteIntentKind;
  execute(intent: SourceWriteIntent): Promise<WriteAcknowledgement>;
  acknowledge(intent: SourceWriteIntent, ack: WriteAcknowledgement): Promise<void>;
  compensate(intent: SourceWriteIntent): Promise<void>;
  abandon(intent: SourceWriteIntent): Promise<void>;
}

export const INTENT_WRITERS = Symbol('INTENT_WRITERS');
