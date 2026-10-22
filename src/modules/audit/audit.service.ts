import { Injectable } from '@nestjs/common';

import { ConflictError } from '../../common/errors/domain.error';
import { auditEvents, type AuditEvent } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { AuditAction, AuditSubjectType } from './audit-actions';
import { currentRequestId } from './request-id.context';

export interface AuditEventInput {
  readonly institutionId: string;
  readonly action: AuditAction;
  readonly subjectType: AuditSubjectType;
  readonly subjectId: string;
  /** Null for an action no person asked for: a job, a cascade, the clock. */
  readonly actorUserId?: string | null;
  readonly summary?: string | null;
  readonly before?: Record<string, unknown> | null;
  readonly after?: Record<string, unknown> | null;
}

/**
 * Writes the record of what was done through {@link TransactionHost#client},
 * which joins whatever transaction the audited write opened. The action and
 * its record therefore commit together or not at all.
 */
@Injectable()
export class AuditService {
  constructor(private readonly txHost: TransactionHost) {}

  async record(input: AuditEventInput, now = new Date()): Promise<AuditEvent> {
    const [recorded] = await this.txHost
      .client()
      .insert(auditEvents)
      .values({
        institutionId: input.institutionId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        summary: input.summary ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        requestId: currentRequestId(),
        occurredAt: now,
      })
      .returning();

    if (!recorded) {
      throw new ConflictError('AUDIT_EVENT_NOT_RECORDED', 'The audit event was not recorded');
    }

    return recorded;
  }
}
