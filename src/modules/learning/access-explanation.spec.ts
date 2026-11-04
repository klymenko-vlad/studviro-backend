import { describe, expect, it } from 'vitest';

import type { Restriction } from '../../database/schema';

import { AvailabilityLens, type GatedSection, type OutlineItem } from './availability-lens';
import { NO_FACTS, type StudentFacts } from './restriction-verdict';
import { NO_NAMES } from './restriction-view';

const NOW = new Date('2026-11-02T09:00:00.000Z');
const LATER = new Date('2026-11-09T09:00:00.000Z');
const EARLIER = new Date('2026-10-26T09:00:00.000Z');
const QUIZ = '6a1f0c1e-0000-4000-8000-0000000000aa';
const S1 = '6a1f0c1e-0000-4000-8000-0000000000b1';
const SECTION = '6a1f0c1e-0000-4000-8000-000000000001';

const afterQuiz: Restriction = {
  match: 'all',
  hideWhenLocked: false,
  conditions: [{ type: 'completed', itemKind: 'assignment', itemId: QUIZ }],
};
const forS1 = (hideFromOthers: boolean, base: Restriction | null = null): Restriction => ({
  ...(base ?? { match: 'all', hideWhenLocked: false, conditions: [] }),
  audience: { groupIds: [S1], hideFromOthers },
});

const item = (overrides: Partial<OutlineItem> = {}): OutlineItem => ({
  visible: true,
  sectionId: null,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  restriction: null,
  ...overrides,
});
const section = (overrides: Partial<GatedSection> = {}): GatedSection => ({
  ...item(),
  id: SECTION,
  ...overrides,
});

const inS1: StudentFacts = { ...NO_FACTS, groupIds: new Set([S1]) };
const quizDone: StudentFacts = { ...inS1, completed: new Set([`assignment:${QUIZ}`]) };

const lens = (facts: StudentFacts = NO_FACTS, sections: GatedSection[] = []) =>
  new AvailabilityLens('participant', sections, facts, NO_NAMES, NOW);

describe('content for some groups', () => {
  it('shows a member everything and hides it from everyone else', () => {
    const subject = item({ restriction: forS1(true) });

    expect(lens(inS1).itemGate(subject)).toEqual({ sight: 'full', restriction: null });
    expect(lens().itemGate(subject)).toEqual({ sight: 'none', restriction: null });
  });

  it('shows everyone else the title and the groups it is for, when the author chooses so', () => {
    const gate = lens().itemGate(item({ restriction: forS1(false) }));

    expect(gate.sight).toBe('title');
    expect(gate.restriction).toMatchObject({
      locked: true,
      conditions: [],
      audience: { hideFromOthers: false, groups: [{ groupId: S1, missing: true }] },
    });
  });

  it('hides it from other groups even when the other conditions show the lock', () => {
    const subject = item({ restriction: forS1(true, afterQuiz) });

    expect(lens().itemGate(subject).sight).toBe('none');
    expect(lens(inS1).itemGate(subject)).toMatchObject({
      sight: 'title',
      restriction: { locked: true, audience: null, conditions: [{ type: 'completed' }] },
    });
    expect(lens(quizDone).itemGate(subject).sight).toBe('full');
  });

  it('closes a section for others and with it everything inside', () => {
    const forGroup = section({ restriction: forS1(true) });

    expect(lens(NO_FACTS, [forGroup]).itemGate(item({ sectionId: SECTION })).sight).toBe(
      'none',
    );
    expect(lens(inS1, [forGroup]).itemGate(item({ sectionId: SECTION })).sight).toBe('full');
  });
});

describe('explaining who can open what', () => {
  it('says why it is closed: hidden, scheduled, ended or locked', () => {
    expect(lens().explainItem(item({ visible: false }), null)).toMatchObject({
      sight: 'none',
      reason: 'hidden',
      source: 'item',
    });
    expect(lens().explainItem(item({ availableFrom: LATER }), null)).toMatchObject({
      sight: 'title',
      reason: 'scheduled',
      availableFrom: LATER,
    });
    expect(lens().explainItem(item({ availableUntil: EARLIER }), null)).toMatchObject({
      sight: 'none',
      reason: 'ended',
    });
    expect(lens().explainItem(item({ restriction: afterQuiz }), null)).toMatchObject({
      sight: 'title',
      reason: 'locked',
      restriction: { conditions: [{ type: 'completed', itemId: QUIZ }] },
    });
  });

  it('gives the author the unmet conditions even when the student sees nothing', () => {
    const hidden = { ...afterQuiz, hideWhenLocked: true };

    expect(lens().explainItem(item({ restriction: hidden }), null)).toMatchObject({
      sight: 'none',
      reason: 'locked',
      restriction: { conditions: [{ type: 'completed' }] },
    });
    expect(lens().explainItem(item({ restriction: forS1(true) }), null)).toMatchObject({
      sight: 'none',
      reason: 'locked',
      restriction: { audience: { groups: [{ groupId: S1 }] } },
    });
  });

  it('blames the section when the section is what keeps it closed', () => {
    const closed = section({ restriction: afterQuiz });

    expect(lens().explainItem(item({ sectionId: SECTION }), closed)).toMatchObject({
      sight: 'none',
      reason: 'locked',
      source: 'section',
    });
    expect(lens(quizDone).explainItem(item({ sectionId: SECTION }), closed)).toMatchObject({
      sight: 'full',
      reason: null,
    });
  });

  it('answers open when nothing stands in the way', () => {
    expect(lens(inS1).explainItem(item({ restriction: forS1(false) }), null)).toEqual({
      sight: 'full',
      reason: null,
      source: null,
      availableFrom: null,
      restriction: null,
    });
  });
});
