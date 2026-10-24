export interface GroupIdentity {
  readonly id: string;
  readonly code: string;
  readonly name: string | null;
}

export function matchGroups(
  source: readonly GroupIdentity[],
  target: readonly GroupIdentity[],
): Map<string, string> {
  const byCode = new Map(target.map((group) => [fold(group.code), group.id]));
  const byName = new Map(
    target.flatMap((group) => (group.name === null ? [] : [[fold(group.name), group.id]])),
  );
  const matched = new Map<string, string>();

  for (const group of source) {
    const id =
      byCode.get(fold(group.code)) ??
      (group.name === null ? undefined : byName.get(fold(group.name)));
    if (id !== undefined) matched.set(group.id, id);
  }

  return matched;
}

export function freeCategoryName(name: string, taken: Set<string>, suffix: string): string {
  let candidate = name;
  for (let round = 1; taken.has(fold(candidate)); round += 1) {
    candidate = round === 1 ? `${name} (${suffix})` : `${name} (${suffix} ${round})`;
  }
  taken.add(fold(candidate));

  return candidate;
}

function fold(value: string): string {
  return value.trim().toLowerCase();
}
