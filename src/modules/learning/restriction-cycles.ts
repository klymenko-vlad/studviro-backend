import type { Restriction } from '../../database/schema';

import { leavesOf } from './restriction';

export interface RestrictionNode {
  readonly key: string;
  readonly sectionId: string | null;
  readonly restriction: Restriction | null;
}

export function findCycle(nodes: readonly RestrictionNode[], start: string): string[] | null {
  const edges = new Map(nodes.map((node) => [node.key, dependenciesOf(node)]));
  const path: string[] = [];
  const onPath = new Set<string>();
  const settled = new Set<string>();

  const visit = (key: string): string[] | null => {
    if (onPath.has(key)) return [...path.slice(path.indexOf(key)), key];
    if (settled.has(key)) return null;

    path.push(key);
    onPath.add(key);
    for (const next of edges.get(key) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    onPath.delete(key);
    settled.add(key);

    return null;
  };

  return visit(start);
}

function dependenciesOf(node: RestrictionNode): string[] {
  const placed = node.sectionId === null ? [] : [`section:${node.sectionId}`];
  if (!node.restriction) return placed;

  return [
    ...placed,
    ...leavesOf(node.restriction).flatMap((leaf) => {
      if (leaf.type === 'completed') return [`${leaf.itemKind}:${leaf.itemId}`];
      if (leaf.type === 'mark') return [`assignment:${leaf.itemId}`];

      return [];
    }),
  ];
}
