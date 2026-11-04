import { describe, expect, it } from 'vitest';

import { contentColumns, labelTitleOf } from './material-content';

describe('contentColumns', () => {
  it('keeps the body of a note, a page and a label and no url', () => {
    for (const kind of ['text', 'page'] as const) {
      expect(contentColumns(kind, { title: 'T', body: 'B', url: 'https://x.org' })).toEqual({
        title: 'T',
        body: 'B',
      });
    }
  });

  it('keeps the url of a link and drops a body', () => {
    expect(contentColumns('link', { title: 'T', body: 'B', url: 'https://x.org' })).toEqual({
      title: 'T',
      url: 'https://x.org',
    });
  });

  it('stores a video as its privacy embed address', () => {
    expect(contentColumns('video', { url: 'https://youtu.be/dQw4w9WgXcQ' })).toEqual({
      url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('titles a label from its text and ignores a title given for it', () => {
    expect(contentColumns('label', { title: 'Ignored', body: 'Part two\nLater' })).toEqual({
      title: 'Part two',
      body: 'Part two\nLater',
    });
  });

  it('keeps nothing of a file or a folder but the title', () => {
    expect(contentColumns('folder', { title: 'Handouts', body: 'B', url: 'u' })).toEqual({
      title: 'Handouts',
    });
    expect(contentColumns('file', { title: 'Slides' })).toEqual({ title: 'Slides' });
  });

  it('leaves out what was not given, so an edit changes only that', () => {
    expect(contentColumns('page', {})).toEqual({});
    expect(contentColumns('label', { title: 'x' })).toEqual({});
  });
});

describe('labelTitleOf', () => {
  it('takes the first line with something on it, with spaces collapsed', () => {
    expect(labelTitleOf('\n  Part   two \nmore')).toBe('Part two');
  });

  it('shortens a long line to 80 characters with an ellipsis', () => {
    const title = labelTitleOf('a'.repeat(200));

    expect(title).toHaveLength(80);
    expect(title.endsWith('…')).toBe(true);
  });
});
