import { categoryKey, type Category, type Organization } from '../services/thought-organizer';

export type Thought = { id: string; text: string; categoryId: string; sourceId: string; start: number; end: number; createdAt: number };
export type ThoughtDump = { id: string; text: string; createdAt: number; method: Organization['method'] };
export type ThoughtStore = { categories: Category[]; thoughts: Thought[]; dumps: ThoughtDump[] };
export const emptyThoughtStore: ThoughtStore = { categories: [], thoughts: [], dumps: [] };

export function appendThoughtDump(current: ThoughtStore, dump: ThoughtDump, organization: Organization): ThoughtStore {
  const categories = [...current.categories];
  const thoughts = organization.parts.map((part, index) => {
    const key = categoryKey(part.category);
    let category = categories.find((item) => categoryKey(item.label) === key);
    if (!category) {
      category = { id: `category:${key}`, label: part.category };
      categories.push(category);
    }
    return { id: `${dump.id}:${index}`, sourceId: dump.id, text: dump.text.slice(part.start, part.end),
      categoryId: category.id, start: part.start, end: part.end, createdAt: dump.createdAt };
  });
  return { categories, thoughts: [...thoughts, ...current.thoughts], dumps: [dump, ...current.dumps] };
}
