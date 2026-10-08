import { categoryCatalogue } from './category-catalogue';
import { buildCategoryRequests, parseCategoryResponse } from './category-classifier';
import { categoryKey, suggestedCategories } from './thought-organizer';

// Rubric IDs stay out of the prompt; the shortlist is generic local retrieval.
export const categoryTestCases = [
  { text: 'I miss my sister.', acceptedIds: [1], expected: 'Family' },
  { text: 'My exams are next week.', acceptedIds: [2], expected: 'School' },
  { text: 'I want to learn to paint.', acceptedIds: [11, 43, 50], expected: 'Hobbies, Creativity or Learning' },
  { text: 'I wish I could spend more time with my parents.', acceptedIds: [1], expected: 'Family' },
  { text: 'My college assignment is due tomorrow.', acceptedIds: [2], expected: 'School' },
  { text: 'I keep waking up during the night.', acceptedIds: [12], expected: 'Sleep' },
];
export const categoryTestText = categoryTestCases.map((sample) => sample.text).join(' ');
const requests = buildCategoryRequests(categoryTestText);
if (requests.length !== 1 || requests[0].units.length !== categoryTestCases.length) throw new Error('The fixed test fixture must fit in one batch.');
export const categoryTestRequest = requests[0];
export const categoryTestPrompt = categoryTestRequest.prompt;
export const categoryTestSchema = categoryTestRequest.responseSchema;
export const categoryCatalogueCount = categoryCatalogue.length;
export type CategoryTestReport =
  | { status: 'invalid'; message: string }
  | { status: 'review'; topicMatches: number; total: number; localCount: number; modelCount: number; modelMatches: number; items: {
      id: number; text: string; category: string; isNew: boolean; topicMatched: boolean; expected: string; method: 'local' | 'model';
    }[] };
export function evaluateCategoryTest(response: string, localIds: readonly number[] = []): CategoryTestReport {
  try {
    const assignments = parseCategoryResponse(categoryTestRequest, response);
    const items = assignments.map((assignment, index) => ({
      id: assignment.id, text: categoryTestCases[index].text, category: assignment.category,
      isNew: !suggestedCategories.some((category) => categoryKey(category) === categoryKey(assignment.category)),
      topicMatched: categoryTestCases[index].acceptedIds.includes(assignment.categoryId),
      expected: categoryTestCases[index].expected,
      method: localIds.includes(assignment.id) ? 'local' as const : 'model' as const,
    }));
    const modelItems = items.filter((item) => item.method === 'model');
    return { status: 'review', total: items.length, items, topicMatches: items.filter((item) => item.topicMatched).length,
      localCount: items.length - modelItems.length, modelCount: modelItems.length, modelMatches: modelItems.filter((item) => item.topicMatched).length }; 
  } catch (error) {
    return { status: 'invalid', message: error instanceof Error ? error.message : 'Gemma did not return usable category IDs.' };
  }
}
