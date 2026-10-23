import { describe, expect, it } from 'vitest';

import { shownTo } from './learning-outline.service';

const HIDDEN_SECTION = '6a1f0c1e-0000-4000-8000-000000000001';
const SHOWN_SECTION = '6a1f0c1e-0000-4000-8000-000000000002';
const hidden = new Set([HIDDEN_SECTION]);

describe('shownTo', () => {
  it('shows an author everything, hidden or not', () => {
    expect(shownTo('author', { visible: false, sectionId: HIDDEN_SECTION }, hidden)).toBe(true);
  });

  it('shows a participant a visible item in the general area or a shown section', () => {
    expect(shownTo('participant', { visible: true, sectionId: null }, hidden)).toBe(true);
    expect(shownTo('participant', { visible: true, sectionId: SHOWN_SECTION }, hidden)).toBe(
      true,
    );
  });

  it('hides an item that is hidden itself', () => {
    expect(shownTo('participant', { visible: false, sectionId: null }, hidden)).toBe(false);
  });

  it('hides a visible item in a hidden section, from participants and observers alike', () => {
    for (const stance of ['participant', 'observer'] as const) {
      expect(shownTo(stance, { visible: true, sectionId: HIDDEN_SECTION }, hidden)).toBe(false);
    }
  });

  it('shows everything visible when no section is hidden', () => {
    expect(shownTo('observer', { visible: true, sectionId: HIDDEN_SECTION }, new Set())).toBe(
      true,
    );
  });
});
