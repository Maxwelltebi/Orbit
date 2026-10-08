import { categoryById } from './category-catalogue';
import { buildCategoryRequests, categoryEvidence, makeCategoryRequest, parseCategoryResponse } from './category-classifier';
import type { CategoryRequest, Unit } from './category-classifier';
import { validateOrganization } from './thought-organizer';

type Assignment = ReturnType<typeof parseCategoryResponse>[number];
export interface HybridPlan {
  source: string; units: Unit[]; local: Assignment[]; requests: CategoryRequest[];
}
// A concrete topic takes priority over feelings/date/worry qualifiers. A sole
// explicit generic topic can also match locally, unless it is negated. Unknown
// and competing topics still defer to Gemma. This is lexical, not AI confidence.
export function clearLocalCategory(text: string): number | null {
  const modifiers = new Set([9, 10, 15]);
  const evidence = [...categoryEvidence(text).keys()];
  const concrete = evidence.filter((id) => !modifiers.has(id));
  if (concrete.length === 1) return concrete[0];
  if (concrete.length === 0 && evidence.length === 1 && !/\b(?:not|never|no longer|hardly)\b/i.test(text)) return evidence[0];
  return null;
}
export function buildHybridPlan(source: string): HybridPlan {
  const full = buildCategoryRequests(source);
  const local: Assignment[] = [];
  const requests: CategoryRequest[] = [];
  for (const batch of full) {
    const ambiguous: Unit[] = [];
    for (const unit of batch.units) {
      const id = clearLocalCategory(unit.text);
      if (id !== null && unit.candidateIds.includes(id)) {
        local.push({ id: unit.id, categoryId: id, start: unit.start, end: unit.end, category: categoryById.get(id)!.label });
      } else ambiguous.push(unit);
    }
    if (ambiguous.length) requests.push(makeCategoryRequest(source, ambiguous));
  }
  return { source, units: full.flatMap((request) => request.units), local, requests };
}
export function completeHybridPlan(plan: HybridPlan, responses: readonly string[]) {
  if (plan.requests.length !== responses.length) throw new Error('Sorting did not finish all ambiguous batches.');
  const assignments = [...plan.local, ...plan.requests.flatMap((request, index) => parseCategoryResponse(request, responses[index]))].sort((a, b) => a.id - b.id);
  if (assignments.length !== plan.units.length || new Set(assignments.map((assignment) => assignment.id)).size !== assignments.length || assignments.some((assignment, index) => assignment.id !== plan.units[index].id)) throw new Error('Sorting returned missing or repeated thoughts.');
  validateOrganization(plan.source, { method: 'model', parts: assignments.map(({ start, end, category }) => ({ start, end, category })) });
  return JSON.stringify(Object.fromEntries(assignments.map((assignment) => [String(assignment.id), assignment.categoryId])));
}
