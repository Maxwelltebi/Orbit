import { categoryById } from './category-catalogue';
import { categoryEvidence, buildCategoryRequests, makeCategoryRequest, parseCategoryResponse } from './category-classifier';
import { validateOrganization } from './thought-organizer';

// Keep the first interactive test small; batching still applies inside this bound.
export const customSortingLimit = 600;
export function validateCustomSource(source?: string): string {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Write a thought before sorting.');
  if (source.length > customSortingLimit) throw new Error('Keep this test to 600 characters or fewer.');
  return source; // Preserve the exact source, including whitespace and punctuation.
}
export type CustomSortingReport =
  | { status: 'invalid'; message: string }
  | { status: 'review'; localCount: number; modelCount: number; items: {
      id: number; text: string; category: string; needsReview: boolean; competingTopics: string[]; method: 'local' | 'model';
    }[] };
export function reviewCustomSorting(source: string, response: string, localIds: readonly number[] = []): CustomSortingReport {
  try {
    validateCustomSource(source);
    const units = buildCategoryRequests(source).flatMap((request) => request.units);
    // This full request is only for validating the merged IDs, never sent to Gemma.
    const assignments = parseCategoryResponse(makeCategoryRequest(source, units), response);
    if (new Set(localIds).size !== localIds.length || localIds.some((id) => !units.some((unit) => unit.id === id))) throw new Error('Invalid sorting method details.');
    validateOrganization(source, { method: 'model', parts: assignments.map(({ start, end, category }) => ({ start, end, category })) });
    const items = assignments.map((assignment) => {
      const text = source.slice(assignment.start, assignment.end);
      const topics = [...categoryEvidence(text).keys()].filter((id) => ![9, 10, 15].includes(id)).map((id) => categoryById.get(id)!.label);
      return {
        id: assignment.id, text, category: assignment.category,
        needsReview: assignment.categoryId === 0 || topics.length > 1,
        competingTopics: topics.length > 1 ? topics : [],
        method: localIds.includes(assignment.id) ? 'local' as const : 'model' as const,
      };
    });
    return { status: 'review', items, localCount: localIds.length, modelCount: items.length - localIds.length };
  } catch (error) {
    return { status: 'invalid', message: error instanceof Error ? error.message : 'The sorting result could not be read.' };
  }
}
