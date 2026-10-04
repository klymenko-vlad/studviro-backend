import { randomUUID } from 'node:crypto';

import { ConflictError } from '../../common/errors/domain.error';

/**
 * `.invalid` is reserved by RFC 2606 and can never resolve, so the placeholder
 * address is unroutable by construction rather than by convention.
 */
export const ERASED_EMAIL_DOMAIN = 'erased.invalid';
export const ERASED_DISPLAY_NAME = 'Erased person';

export interface AnonymisedIdentity {
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: null;
}

export interface ErasureTally {
  readonly refreshTokens: number;
  readonly passwordResetTokens: number;
  readonly twoFactorCredentials: number;
  readonly recoveryCodes: number;
  readonly userEmails: number;
  readonly externalIdentities: number;
  readonly invitations: number;
  readonly submissionFiles: number;
  readonly storedObjects: number;
  readonly conflictNotes: number;
  readonly assessmentFeedback: number;
  readonly submissionNotes: number;
}

export function newErasureId(): string {
  return randomUUID();
}

export function anonymisedIdentity(erasureId: string): AnonymisedIdentity {
  return {
    email: `erased-${erasureId}@${ERASED_EMAIL_DOMAIN}`,
    displayName: ERASED_DISPLAY_NAME,
    passwordHash: null,
  };
}

/**
 * Names the fact and not the other institution: telling one controller which
 * other controller holds the person would leak the very relationship the
 * refusal exists to protect.
 */
export function assertLastInstitution(
  institutionId: string,
  relatedInstitutionIds: readonly string[],
): void {
  const others = new Set(relatedInstitutionIds.filter((id) => id !== institutionId));
  if (others.size === 0) return;

  throw new ConflictError(
    'PERSON_KNOWN_TO_ANOTHER_INSTITUTION',
    'This person still has an active relationship with another institution, which must end before their personal data can be erased',
    { otherInstitutionCount: others.size },
  );
}

export interface ErasureAuditRecord {
  readonly summary: string;
  readonly after: Record<string, unknown>;
}

/**
 * Deliberately built from the tally and the erasure id alone. An audit trail
 * that carries the erased person's id, address or name defeats the erasure it
 * records.
 */
export function erasureAuditRecord(erasureId: string, tally: ErasureTally): ErasureAuditRecord {
  return {
    summary: 'Personal data erased; the academic record was kept and anonymised',
    after: { erasureId, ...tally },
  };
}
