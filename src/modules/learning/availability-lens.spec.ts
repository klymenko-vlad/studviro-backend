import { describe, expect, it } from 'vitest';

import type { Restriction } from '../../database/schema';

import { AvailabilityLens, type GatedSection, type OutlineItem } from './availability-lens';
import type { LearningStance } from './learning-access.service';
import { NO_FACTS, type StudentFacts } from './restriction-verdict';
import { NO_NAMES } from './restriction-view';

const CLOSED_SECTION = '6a1f0c1e-0000-4000-8000-000000000001';
const OPEN_SECTION = '6a1f0c1e-0000-4000-8000-000000000002';
const LOCKED_SECTION = '6a1f0c1e-0000-4000-8000-000000000003';
const QUIZ = '6a1f0c1e-0000-4000-8000-0000000000aa';
const NOW = new Date('2026-11-02T09:00:00.000Z');
const LATER = new Date('2026-11-09T09:00:00.000Z');
const EARLIER = new Date('2026-10-26T09:00:00.000Z');

const afterQuiz = (hideWhenLocked = false): Restriction => ({
  match: 'all',
  hideWhenLocked,
  conditions: [{ type: 'completed', itemKind: 'assignment', itemId: QUIZ }],
});

const section = (id: string, overrides: Partial<GatedSection> = {}): GatedSection => ({
  id,
  visible: true,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  restriction: null,
  ...overrides,
});

const sections = [
  section(CLOSED_SECTION, { visible: false }),
  section(OPEN_SECTION),
  section(LOCKED_SECTION, { restriction: afterQuiz() }),
];

const item = (overrides: Partial<OutlineItem> = {}): OutlineItem => ({
  visible: true,
  sectionId: null,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  restriction: null,
  ...overrides,
});

const quizDone: StudentFacts = { ...NO_FACTS, completed: new Set([`assignment:${QUIZ}`]) };

const lens = (stance: LearningStance, facts: StudentFacts = NO_FACTS, known = sections) =>
  new AvailabilityLens(stance, known, facts, NO_NAMES, NOW);

const sightOf = (
  stance: LearningStance,
  overrides: Partial<OutlineItem> = {},
  facts = NO_FACTS,
) => lens(stance, facts).itemGate(item(overrides)).sight;

describe('AvailabilityLens', () => {
  describe('windows and sections', () => {
    it('shows an author everything in full: hidden, scheduled, ended, locked or in a closed section', () => {
      for (const overrides of [
        { visible: false, sectionId: CLOSED_SECTION },
        { availableFrom: LATER, hiddenUntilAvailable: true },
        { availableUntil: EARLIER },
        { restriction: afterQuiz(true), sectionId: LOCKED_SECTION },
      ]) {
        expect(sightOf('author', overrides)).toBe('full');
      }
    });

    it('shows a participant a visible item in the general area or an open section', () => {
      expect(sightOf('participant')).toBe('full');
      expect(sightOf('participant', { sectionId: OPEN_SECTION })).toBe('full');
    });

    it('hides an item that is hidden itself', () => {
      expect(sightOf('participant', { visible: false })).toBe('none');
    });

    it('hides a visible item in a closed section, from participants and observers alike', () => {
      for (const stance of ['participant', 'observer'] as const) {
        expect(sightOf(stance, { sectionId: CLOSED_SECTION })).toBe('none');
      }
    });

    it('hides even an item that would show its title, when its section is closed', () => {
      expect(sightOf('participant', { sectionId: CLOSED_SECTION, availableFrom: LATER })).toBe(
        'none',
      );
    });

    it('shows the title of an item in an open section that opens later', () => {
      expect(sightOf('participant', { sectionId: OPEN_SECTION, availableFrom: LATER })).toBe(
        'title',
      );
    });

    it('hides an item whose window has ended', () => {
      expect(sightOf('participant', { availableUntil: EARLIER })).toBe('none');
    });

    it('treats a section it does not know as open', () => {
      expect(
        lens('observer', NO_FACTS, []).itemGate(item({ sectionId: CLOSED_SECTION })).sight,
      ).toBe('full');
    });
  });

  describe('restrictions', () => {
    it('shows a locked item as its title and what is still needed', () => {
      const gate = lens('participant').itemGate(item({ restriction: afterQuiz() }));

      expect(gate.sight).toBe('title');
      expect(gate.restriction).toMatchObject({
        locked: true,
        conditions: [{ type: 'completed', itemId: QUIZ, missing: true }],
      });
    });

    it('hides a locked item outright when the author chose so', () => {
      expect(sightOf('participant', { restriction: afterQuiz(true) })).toBe('none');
    });

    it('opens the item, with nothing to explain, once the condition holds', () => {
      const gate = lens('participant', quizDone).itemGate(
        item({ restriction: afterQuiz(true) }),
      );

      expect(gate).toEqual({ sight: 'full', restriction: null });
    });

    it('keeps a scheduled item scheduled even when its condition holds', () => {
      expect(
        sightOf('participant', { restriction: afterQuiz(), availableFrom: LATER }, quizDone),
      ).toBe('title');
    });

    it('lets a hidden item stay hidden whatever its restriction says', () => {
      expect(sightOf('participant', { restriction: afterQuiz(), visible: false })).toBe('none');
    });

    it('shows a locked section as its title, and nothing inside it, until it opens', () => {
      const shut = lens('participant');
      const opened = lens('participant', quizDone);
      const locked = sections[2]!;

      expect(shut.sectionGate(locked)).toMatchObject({
        sight: 'title',
        restriction: { locked: true },
      });
      expect(shut.itemGate(item({ sectionId: LOCKED_SECTION })).sight).toBe('none');
      expect(opened.sectionGate(locked)).toEqual({ sight: 'full', restriction: null });
      expect(opened.itemGate(item({ sectionId: LOCKED_SECTION })).sight).toBe('full');
    });

    it('describes the whole restriction to an author, never as locked', () => {
      expect(
        lens('author').itemGate(item({ restriction: afterQuiz(true) })).restriction,
      ).toMatchObject({
        locked: false,
        hideWhenLocked: true,
        conditions: [{ type: 'completed' }],
      });
    });
  });
});
