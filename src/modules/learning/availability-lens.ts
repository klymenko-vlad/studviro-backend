import type { Restriction } from '../../database/schema';

import type { LearningStance } from './learning-access.service';
import { ownSight, type Schedulable, type Sight } from './learning-availability';
import { verdictOf, type StudentFacts } from './restriction-verdict';
import { viewOf, type RestrictionNames, type RestrictionView } from './restriction-view';

export interface Restricted extends Schedulable {
  readonly restriction: Restriction | null;
}

export interface OutlineItem extends Restricted {
  readonly sectionId: string | null;
}

export interface GatedSection extends Restricted {
  readonly id: string;
}

export interface Gate {
  readonly sight: Sight;
  readonly restriction: RestrictionView | null;
}

const CLOSED: Gate = { sight: 'none', restriction: null };

export class AvailabilityLens {
  private readonly sectionGates: ReadonlyMap<string, Gate>;

  constructor(
    private readonly stance: LearningStance,
    sections: readonly GatedSection[],
    private readonly facts: StudentFacts,
    private readonly names: RestrictionNames,
    private readonly now: Date,
  ) {
    this.sectionGates = new Map(sections.map((section) => [section.id, this.gateOf(section)]));
  }

  sectionGate(section: GatedSection): Gate {
    return this.sectionGates.get(section.id) ?? this.gateOf(section);
  }

  itemGate(item: OutlineItem): Gate {
    if (this.stance !== 'author' && item.sectionId !== null) {
      const section = this.sectionGates.get(item.sectionId);
      if (section && section.sight !== 'full') return CLOSED;
    }

    return this.gateOf(item);
  }

  gateOf(subject: Restricted): Gate {
    const { restriction } = subject;

    if (this.stance === 'author') {
      return {
        sight: 'full',
        restriction:
          restriction && viewOf(restriction, restriction.conditions, this.names, false),
      };
    }

    const sight = ownSight(subject, this.now);
    if (sight === 'none' || !restriction) return { sight, restriction: null };

    const verdict = verdictOf(restriction, this.facts, this.now);
    if (verdict.open) return { sight, restriction: null };
    if (restriction.hideWhenLocked) return CLOSED;

    return {
      sight: 'title',
      restriction: viewOf(restriction, verdict.unmet, this.names, true),
    };
  }
}
