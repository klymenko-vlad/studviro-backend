import { describe, expect, it } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import { assertPayloadMatchesKind } from './learning-material-payload';

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof InvalidInputError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }

  return 'NO_ERROR';
};

describe('assertPayloadMatchesKind', () => {
  it('accepts a file that names an uploaded object', () => {
    expect(() => {
      assertPayloadMatchesKind({
        kind: 'file',
        storageKey: 'institutions/x/materials/y/a.pdf',
      });
    }).not.toThrow();
  });

  it('refuses a file with no object behind it', () => {
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'file' });
      }),
    ).toBe('LEARNING_MATERIAL_FILE_MISSING');
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'file', storageKey: '' });
      }),
    ).toBe('LEARNING_MATERIAL_FILE_MISSING');
  });

  it('accepts an http and an https link', () => {
    expect(() => {
      assertPayloadMatchesKind({ kind: 'link', url: 'https://example.org/notes' });
    }).not.toThrow();
    expect(() => {
      assertPayloadMatchesKind({ kind: 'link', url: 'http://example.org/notes' });
    }).not.toThrow();
  });

  it('refuses a link that is not one, or that is a script', () => {
    for (const url of [
      undefined,
      '',
      'notes.pdf',
      'javascript:alert(1)',
      'file:///etc/passwd',
    ]) {
      expect(
        codeOf(() => {
          assertPayloadMatchesKind({ kind: 'link', url });
        }),
      ).toBe('LEARNING_MATERIAL_URL_INVALID');
    }
  });

  it('accepts text with something in it', () => {
    expect(() => {
      assertPayloadMatchesKind({ kind: 'text', body: 'Read chapter 4.' });
    }).not.toThrow();
  });

  it('refuses text that is empty or only whitespace', () => {
    for (const body of [undefined, '', '   \n ']) {
      expect(
        codeOf(() => {
          assertPayloadMatchesKind({ kind: 'text', body });
        }),
      ).toBe('LEARNING_MATERIAL_BODY_MISSING');
    }
  });
});
