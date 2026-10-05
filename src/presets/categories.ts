/** Preset categories from docs/PLAN.md section 2.3. The browser groups by the part before the slash. */
export const CATEGORIES = [
  'UI/Click',
  'UI/Tap',
  'UI/Toggle',
  'UI/Hover',
  'UI/Swipe',
  'UI/Notification',
  'UI/Success',
  'UI/Error',
  'Foley/Switch',
  'Foley/Keyboard',
  'Foley/Camera',
  'Foley/Toy',
  'Foley/Mechanism',
  'Game/Jump',
  'Game/Coin',
  'Game/Power-up',
  'Game/Laser',
  'Game/Hit',
  'Game/Explosion',
  'Game/Menu',
  'Game/Pickup',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const TAGS = ['retro', 'chiptune', '8-bit', 'modern', 'soft', 'harsh', 'short', 'long'] as const;

export const isCategory = (c: string): c is Category => (CATEGORIES as readonly string[]).includes(c);

/** 'Game/Coin' -> ['Game', 'Coin']; anything without a slash goes under 'Other'. */
export function splitCategory(category: string): [group: string, leaf: string] {
  const i = category.indexOf('/');
  return i < 0 ? ['Other', category] : [category.slice(0, i), category.slice(i + 1)];
}

export interface CategoryNode {
  group: string;
  leaves: { category: string; leaf: string; count: number }[];
  count: number;
}

/** Category tree for the browser sidebar: the fixed categories first (even if empty), then any extras. */
export function categoryTree(categories: Iterable<string>): CategoryNode[] {
  const counts = new Map<string, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const all = [...CATEGORIES, ...[...counts.keys()].filter((c) => !isCategory(c)).sort()];
  const groups = new Map<string, CategoryNode>();
  for (const category of all) {
    const [group, leaf] = splitCategory(category);
    let node = groups.get(group);
    if (!node) groups.set(group, (node = { group, leaves: [], count: 0 }));
    const count = counts.get(category) ?? 0;
    node.leaves.push({ category, leaf, count });
    node.count += count;
  }
  return [...groups.values()];
}
