import { describe, expect, it } from 'vitest';

import { sightOf } from './learning-outline.service';

const CLOSED_SECTION = '6a1f0c1e-0000-4000-8000-000000000001';
const OPEN_SECTION = '6a1f0c1e-0000-4000-8000-000000000002';
const closed = new Set([CLOSED_SECTION]);
const NOW = new Date('2026-11-02T09:00:00.000Z');
const LATER = new Date('2026-11-09T09:00:00.000Z');
const EARLIER = new Date('2026-10-26T09:00:00.000Z');

const item = (overrides: Partial<Parameters<typeof sightOf>[1]> = {}) => ({
  visible: true,
  sectionId: null,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  ...overrides,
});

describe('sightOf', () => {
  it('shows an author everything in full: hidden, scheduled, ended or in a closed section', () => {
    for (const overrides of [
      { visible: false, sectionId: CLOSED_SECTION },
      { availableFrom: LATER, hiddenUntilAvailable: true },
      { availableUntil: EARLIER },
    ]) {
      expect(sightOf('author', item(overrides), closed, NOW)).toBe('full');
    }
  });

  it('shows a participant a visible item in the general area or an open section', () => {
    expect(sightOf('participant', item(), closed, NOW)).toBe('full');
    expect(sightOf('participant', item({ sectionId: OPEN_SECTION }), closed, NOW)).toBe('full');
  });

  it('hides an item that is hidden itself', () => {
    expect(sightOf('participant', item({ visible: false }), closed, NOW)).toBe('none');
  });

  it('hides a visible item in a closed section, from participants and observers alike', () => {
    for (const stance of ['participant', 'observer'] as const) {
      expect(sightOf(stance, item({ sectionId: CLOSED_SECTION }), closed, NOW)).toBe('none');
    }
  });

  it('hides even an item that would show its title, when its section is closed', () => {
    expect(
      sightOf(
        'participant',
        item({ sectionId: CLOSED_SECTION, availableFrom: LATER }),
        closed,
        NOW,
      ),
    ).toBe('none');
  });

  it('shows the title of an item in an open section that opens later', () => {
    expect(
      sightOf(
        'participant',
        item({ sectionId: OPEN_SECTION, availableFrom: LATER }),
        closed,
        NOW,
      ),
    ).toBe('title');
  });

  it('hides an item whose window has ended', () => {
    expect(sightOf('participant', item({ availableUntil: EARLIER }), closed, NOW)).toBe('none');
  });

  it('shows everything open when no section is closed', () => {
    expect(sightOf('observer', item({ sectionId: CLOSED_SECTION }), new Set(), NOW)).toBe(
      'full',
    );
  });
});
