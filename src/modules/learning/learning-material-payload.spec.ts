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
        title: 'Slides',
        storageKey: 'institutions/x/materials/y/a.pdf',
      });
    }).not.toThrow();
  });

  it('refuses a file with no object behind it', () => {
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'file', title: 'Slides' });
      }),
    ).toBe('LEARNING_MATERIAL_FILE_MISSING');
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'file', title: 'Slides', storageKey: '' });
      }),
    ).toBe('LEARNING_MATERIAL_FILE_MISSING');
  });

  it('accepts an http and an https link', () => {
    expect(() => {
      assertPayloadMatchesKind({
        kind: 'link',
        title: 'Notes',
        url: 'https://example.org/notes',
      });
    }).not.toThrow();
    expect(() => {
      assertPayloadMatchesKind({
        kind: 'link',
        title: 'Notes',
        url: 'http://example.org/notes',
      });
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
          assertPayloadMatchesKind({ kind: 'link', title: 'Notes', url });
        }),
      ).toBe('LEARNING_MATERIAL_URL_INVALID');
    }
  });

  it('accepts text with something in it', () => {
    expect(() => {
      assertPayloadMatchesKind({ kind: 'text', title: 'Week 1', body: 'Read chapter 4.' });
    }).not.toThrow();
  });

  it('refuses text that is empty or only whitespace', () => {
    for (const body of [undefined, '', '   \n ']) {
      expect(
        codeOf(() => {
          assertPayloadMatchesKind({ kind: 'text', title: 'Week 1', body });
        }),
      ).toBe('LEARNING_MATERIAL_BODY_MISSING');
    }
  });

  it('accepts a page with a body and refuses one without', () => {
    expect(() => {
      assertPayloadMatchesKind({ kind: 'page', title: 'Reading', body: '# Week 1\n\nRead.' });
    }).not.toThrow();
    for (const body of [undefined, '', ' \n ']) {
      expect(
        codeOf(() => {
          assertPayloadMatchesKind({ kind: 'page', title: 'Reading', body });
        }),
      ).toBe('LEARNING_MATERIAL_BODY_MISSING');
    }
  });

  it('takes a page up to 100 000 characters and no more', () => {
    expect(() => {
      assertPayloadMatchesKind({ kind: 'page', title: 'Long', body: 'a'.repeat(100_000) });
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'page', title: 'Long', body: 'a'.repeat(100_001) });
      }),
    ).toBe('LEARNING_MATERIAL_BODY_TOO_LONG');
  });

  it('keeps a note to 20 000 characters, as before', () => {
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'text', title: 'Note', body: 'a'.repeat(20_001) });
      }),
    ).toBe('LEARNING_MATERIAL_BODY_TOO_LONG');
  });

  it('takes a label of up to 1 000 characters with no title of its own', () => {
    expect(() => {
      assertPayloadMatchesKind({ kind: 'label', body: 'a'.repeat(1000) });
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'label', body: 'a'.repeat(1001) });
      }),
    ).toBe('LEARNING_MATERIAL_BODY_TOO_LONG');
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'label', body: '  ' });
      }),
    ).toBe('LEARNING_MATERIAL_BODY_MISSING');
  });

  it('needs a title on every kind but a label', () => {
    for (const title of [undefined, '', '   ']) {
      expect(
        codeOf(() => {
          assertPayloadMatchesKind({ kind: 'text', title, body: 'Read.' });
        }),
      ).toBe('LEARNING_MATERIAL_TITLE_MISSING');
    }
    expect(
      codeOf(() => {
        assertPayloadMatchesKind({ kind: 'folder' });
      }),
    ).toBe('LEARNING_MATERIAL_TITLE_MISSING');
  });

  it('accepts a YouTube or Vimeo video and refuses any other address', () => {
    expect(() => {
      assertPayloadMatchesKind({
        kind: 'video',
        title: 'Talk',
        url: 'https://youtu.be/dQw4w9WgXcQ',
      });
    }).not.toThrow();
    expect(() => {
      assertPayloadMatchesKind({
        kind: 'video',
        title: 'Talk',
        url: 'https://vimeo.com/76979871',
      });
    }).not.toThrow();
    for (const url of [undefined, '', 'https://example.org/video.mp4', 'javascript:alert(1)']) {
      expect(
        codeOf(() => {
          assertPayloadMatchesKind({ kind: 'video', title: 'Talk', url });
        }),
      ).toBe('LEARNING_MATERIAL_VIDEO_UNSUPPORTED');
    }
  });

  it('accepts a folder with nothing in it yet', () => {
    expect(() => {
      assertPayloadMatchesKind({ kind: 'folder', title: 'Week 1 handouts' });
    }).not.toThrow();
  });

  it('lets a label be tracked by nothing', () => {
    expect(() => {
      assertPayloadMatchesKind({ kind: 'label', body: 'Part two', completionRule: 'none' });
    }).not.toThrow();
    for (const completionRule of ['manual', 'viewed'] as const) {
      expect(
        codeOf(() => {
          assertPayloadMatchesKind({ kind: 'label', body: 'Part two', completionRule });
        }),
      ).toBe('COMPLETION_RULE_NOT_APPLICABLE');
    }
  });
});
