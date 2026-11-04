import type { LearningActivity, LearningMaterial, Restriction } from '../../database/schema';
import type { StorageKey } from '../storage/storage.types';

import { activityKindOf } from './activity-kind';
import { shiftDate, type DateShift } from './course-import-dates';
import { remapRestriction } from './course-import-restriction';
import type {
  ImportFlag,
  ImportSnapshot,
  ImportVisibility,
  ObjectCopy,
} from './course-import.types';

export interface ImportPlanInput {
  readonly snapshot: ImportSnapshot;
  readonly institutionId: string;
  readonly spaceId: string;
  readonly userId: string;
  readonly shift: DateShift;
  readonly groups: ReadonlyMap<string, string>;
  readonly takenCategoryNames: readonly string[];
  readonly categorySuffix: string;
  readonly visibility: ImportVisibility;
  readonly newId: () => string;
  readonly newKey: (filename: string) => StorageKey;
}

type Placeable = Pick<LearningActivity, 'id' | 'sectionId' | 'position' | 'createdAt'>;

export class ImportPlanContext {
  readonly flags: ImportFlag[] = [];
  readonly copies: ObjectCopy[] = [];
  shiftedDates = 0;
  remappedReferences = 0;

  private readonly ids = new Map<string, string>();
  private readonly sectionIds = new Map<string, string>();
  private readonly generalOrder = new Map<string, number>();

  constructor(
    readonly input: ImportPlanInput,
    materials: readonly LearningMaterial[],
  ) {
    const { snapshot, newId } = input;
    for (const section of snapshot.sections) this.sectionIds.set(section.id, newId());
    for (const material of materials) this.ids.set(`material:${material.id}`, newId());
    for (const { activity } of snapshot.activities) {
      this.ids.set(`${activityKindOf(activity.type)}:${activity.id}`, newId());
    }

    [...materials, ...snapshot.activities.map(({ activity }) => activity)]
      .filter((item) => !this.sectionIds.has(item.sectionId ?? ''))
      .sort(byPlace)
      .forEach((item, index) => this.generalOrder.set(item.id, index));
  }

  sectionIdOf(oldId: string): string {
    return required(this.sectionIds, oldId);
  }

  materialIdOf(oldId: string): string | undefined {
    return this.ids.get(`material:${oldId}`);
  }

  activityIdOf(activity: Pick<LearningActivity, 'id' | 'type'>): string {
    return required(this.ids, `${activityKindOf(activity.type)}:${activity.id}`);
  }

  shifted(date: Date | null): Date | null {
    if (date !== null) this.shiftedDates += 1;

    return shiftDate(date, this.input.shift.milliseconds);
  }

  restrictionOf(restriction: Restriction | null, title: string) {
    const remapped = remapRestriction(
      restriction,
      { items: this.ids, groups: this.input.groups },
      this.input.shift.milliseconds,
    );
    this.shiftedDates += remapped.shifted;
    this.remappedReferences += remapped.remapped;
    if (remapped.droppedGroups > 0) this.flags.push({ code: 'group_dropped', title });
    if (remapped.missingItems > 0) this.flags.push({ code: 'reference_missing', title });

    return { restriction: remapped.restriction, lostGroups: remapped.droppedGroups > 0 };
  }

  placeOf(item: Placeable): { sectionId: string | null; position: number } {
    const sectionId = item.sectionId === null ? undefined : this.sectionIds.get(item.sectionId);

    return sectionId === undefined
      ? { sectionId: null, position: this.generalOrder.get(item.id) ?? 0 }
      : { sectionId, position: item.position ?? 0 };
  }

  visibleOf(sectionId: string | null, visible: boolean, lostGroups: boolean): boolean {
    return visible && !lostGroups && (this.input.visibility === 'source' || sectionId !== null);
  }

  copyOf(from: StorageKey, filename: string): StorageKey {
    const to = this.input.newKey(filename);
    this.copies.push({ from, to });

    return to;
  }
}

export function byPlace(
  a: Pick<LearningActivity, 'position' | 'createdAt'>,
  b: Pick<LearningActivity, 'position' | 'createdAt'>,
): number {
  return (a.position ?? 0) - (b.position ?? 0) || a.createdAt.getTime() - b.createdAt.getTime();
}

function required(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key);
  if (value === undefined) throw new Error(`nothing planned for ${key}`);

  return value;
}
