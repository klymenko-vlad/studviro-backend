import { describe, expect, it } from 'vitest';

import { ConflictError } from '../../common/errors/domain.error';

import {
  anonymisedIdentity,
  assertLastInstitution,
  erasureAuditRecord,
  ERASED_DISPLAY_NAME,
  newErasureId,
  type ErasureTally,
} from './erasure-rules';

const tally: ErasureTally = {
  refreshTokens: 3,
  calendarFeeds: 1,
  passwordResetTokens: 1,
  twoFactorCredentials: 1,
  recoveryCodes: 10,
  userEmails: 2,
  externalIdentities: 1,
  invitations: 1,
  submissionFiles: 2,
  storedObjects: 2,
  conflictNotes: 1,
  assessmentFeedback: 4,
  discussionPosts: 0,
  personalTasks: 0,
  personalEvents: 0,
  submissionNotes: 2,
};

describe('anonymisedIdentity', () => {
  it('replaces the address with an unroutable placeholder', () => {
    const identity = anonymisedIdentity('e6c2b0c0-0000-4000-8000-000000000001');

    expect(identity.email).toBe('erased-e6c2b0c0-0000-4000-8000-000000000001@erased.invalid');
    expect(identity.email.endsWith('.invalid')).toBe(true);
  });

  it('gives two erasures two different addresses, so neither collides', () => {
    expect(anonymisedIdentity(newErasureId()).email).not.toBe(
      anonymisedIdentity(newErasureId()).email,
    );
  });

  it('neutralises the display name and drops the password digest', () => {
    const identity = anonymisedIdentity(newErasureId());

    expect(identity.displayName).toBe(ERASED_DISPLAY_NAME);
    expect(identity.passwordHash).toBeNull();
  });
});

describe('assertLastInstitution', () => {
  it('allows the erasure when this is the only institution that knows them', () => {
    expect(() => {
      assertLastInstitution('a', ['a', 'a']);
    }).not.toThrow();
  });

  it('allows the erasure when nothing else relates to them at all', () => {
    expect(() => {
      assertLastInstitution('a', []);
    }).not.toThrow();
  });

  it('refuses when another institution still has a relationship', () => {
    expect(() => {
      assertLastInstitution('a', ['a', 'b']);
    }).toThrow(ConflictError);
  });

  it('names the fact and counts the others without naming them', () => {
    try {
      assertLastInstitution('a', ['b', 'c', 'c']);
      expect.unreachable('the refusal did not happen');
    } catch (error) {
      const refusal = error as ConflictError;

      expect(refusal.code).toBe('PERSON_KNOWN_TO_ANOTHER_INSTITUTION');
      expect(refusal.details).toEqual({ otherInstitutionCount: 2 });
      expect(JSON.stringify(refusal.details)).not.toContain('b');
    }
  });
});

describe('erasureAuditRecord', () => {
  it('records the counts under the erasure id', () => {
    const record = erasureAuditRecord('erasure-1', tally);

    expect(record.after).toMatchObject({ erasureId: 'erasure-1', refreshTokens: 3 });
    expect(record.summary).toContain('erased');
  });

  it('carries no identifier of the erased person', () => {
    const serialised = JSON.stringify(erasureAuditRecord('erasure-1', tally));

    for (const identifier of [
      '11111111-1111-4111-8111-111111111111',
      'student@example.com',
      'Jana Nováková',
    ]) {
      expect(serialised).not.toContain(identifier);
    }
  });
});
