import type { Category } from './thought-organizer';

export const ORBIT_SIZE = 340;
export const ORBIT_RADIUS = 124;
export const ORBIT_PERIOD_MS = 180000;
export const SATELLITES_PER_PAGE = 6;
export type OrbitBubble = Category & { count: number; central: boolean; angle: number; radius: number };

export function dominantCategory(categories: readonly Category[], counts: ReadonlyMap<string, number>, previous: string | null) {
  const maximum = Math.max(0, ...categories.map((category) => counts.get(category.id) ?? 0));
  if (!maximum) return null;
  // An equal count never displaces the current centre.
  if (previous && categories.some((category) => category.id === previous) && counts.get(previous) === maximum) return previous;
  return categories.find((category) => counts.get(category.id) === maximum)?.id ?? null;
}

export function orbitPage(categories: readonly Category[], counts: ReadonlyMap<string, number>, leaderId: string | null, requestedPage: number) {
  const leader = categories.find((category) => category.id === leaderId);
  const satellites = categories.filter((category) => category.id !== leaderId);
  const pageCount = Math.max(1, Math.ceil(satellites.length / SATELLITES_PER_PAGE));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  const visible = satellites.slice(page * SATELLITES_PER_PAGE, (page + 1) * SATELLITES_PER_PAGE);
  const bubbles: OrbitBubble[] = leader ? [{ ...leader, count: counts.get(leader.id) ?? 0, central: true,
    angle: 0, radius: 62 + Math.min(8, Math.sqrt(counts.get(leader.id) ?? 0) * 1.3) }] : [];
  visible.forEach((category, index) => {
    const count = counts.get(category.id) ?? 0;
    bubbles.push({ ...category, count, central: false, angle: -Math.PI / 2 + (index * Math.PI * 2) / visible.length,
      radius: 28 + Math.min(7, Math.sqrt(count) * 1.8) });
  });
  return { bubbles, page, pageCount };
}

export function orbitPoint(angle: number, distance: number, phase: number) {
  'worklet';
  return { x: ORBIT_SIZE / 2 + Math.cos(angle + phase) * distance,
    y: ORBIT_SIZE / 2 + Math.sin(angle + phase) * distance };
}
