export type Category = { id: string; label: string };
export type ThoughtPart = { start: number; end: number; category: string };
export type Organization = { method: 'preview' | 'model' | 'manual'; parts: ThoughtPart[] };
export type ThoughtOrganizer = (text: string, categories: readonly Category[]) => Promise<Organization>;

export const suggestedCategories = ['Family', 'School', 'The future', 'Money', 'What if?'];

const topics: { label: string; words: string[] }[] = [
  { label: 'Family', words: ['family', 'mom', 'mum', 'mother', 'dad', 'father', 'parents', 'sister', 'brother', 'children', 'daughter', 'son'] },
  { label: 'School', words: ['school', 'exam', 'exams', 'homework', 'college', 'university', 'class', 'teacher', 'studying', 'assignment'] },
  { label: 'Money', words: ['money', 'rent', 'bills', 'bill', 'debt', 'salary', 'budget', 'savings', 'pay', 'financial'] },
  { label: 'Work', words: ['work', 'job', 'boss', 'office', 'career', 'colleague', 'coworker', 'deadline'] },
  { label: 'Health', words: ['health', 'doctor', 'hospital', 'sick', 'illness', 'pain', 'headache', 'medication'] },
  { label: 'Friends', words: ['friend', 'friends', 'friendship'] },
  { label: 'Relationships', words: ['relationship', 'partner', 'boyfriend', 'girlfriend', 'husband', 'wife', 'dating', 'breakup'] },
  { label: 'Sleep', words: ['sleep', 'sleeping', 'insomnia', 'tired', 'nightmare'] },
  { label: 'Hobbies', words: ['hobby', 'hobbies', 'painting', 'music', 'guitar', 'reading', 'gardening', 'photography'] },
  { label: 'Travel', words: ['travel', 'trip', 'vacation', 'holiday', 'flight'] },
  { label: 'Home', words: ['house', 'home', 'moving', 'apartment', 'landlord'] },
  { label: 'The future', words: ['future', 'goals', 'dreams', 'next year', 'plans'] },
  { label: 'What if?', words: ['what if', 'worry', 'worried', 'worries', 'anxious', 'anxiety', 'overthinking'] },
];

const aliases: Record<string, string> = {
  finance: 'Money', finances: 'Money', financial: 'Money', career: 'Work', education: 'School',
  friendship: 'Friends', relationships: 'Relationships', future: 'The future', 'what if': 'What if?',
};

export function categoryKey(label: string) {
  return label.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function cleanCategory(label: string) {
  const cleaned = label.trim().replace(/\s+/g, ' ');
  const key = categoryKey(cleaned);
  if (!key || cleaned.length > 48) throw new Error('Use a category name between 1 and 48 characters.');
  return aliases[key] ?? topics.find((topic) => categoryKey(topic.label) === key)?.label ?? cleaned;
}

function includesPhrase(text: string, phrase: string) {
  return (` ${categoryKey(text)} `).includes(` ${categoryKey(phrase)} `);
}

function previewCategory(text: string, categories: readonly Category[]) {
  // Conservative keyword matching for Expo Go, NOT a language model.
  const candidates = topics.map((topic) => ({
    label: topic.label, score: topic.words.filter((word) => includesPhrase(text, word)).length,
  }));
  for (const category of categories) {
    if (!candidates.some((candidate) => categoryKey(candidate.label) === categoryKey(category.label))) {
      candidates.push({ label: category.label, score: includesPhrase(text, category.label) ? 1 : 0 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best?.score) return 'Unsorted';
  // Generic worry/future words should not override a concrete life topic.
  const concrete = candidates.filter((candidate) => candidate.score > 0 && !['What if?', 'The future'].includes(candidate.label));
  if (concrete.length) return concrete.length === 1 ? concrete[0].label : 'Unsorted';
  return best.label;
}

export function sentenceSpans(text: string) {
  const parts: { start: number; end: number }[] = [];
  let cursor = 0;
  function append(end: number) {
    let start = cursor;
    cursor = end;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end > start) parts.push({ start, end });
  }
  // Split sentences/lines without rewriting the user's words. Decimal points stay intact.
  for (const match of text.matchAll(/[.!?]+(?=\s|$)|\n+|;/g)) append(match.index + match[0].length);
  append(text.length);
  return parts;
}

export const organizePreview: ThoughtOrganizer = async (text, categories) => ({
  method: 'preview',
  parts: sentenceSpans(text).map((span) => ({ ...span, category: previewCategory(text.slice(span.start, span.end), categories) })),
});

export function organizeManually(text: string, category: string): Organization {
  return { method: 'manual', parts: [{ start: 0, end: text.length, category: cleanCategory(category) }] };
}

// Apply this to ALL organizers, including Gemma. Reject incomplete, overlapping or invented spans.
export function validateOrganization(text: string, organization: Organization): Organization {
  if (!['preview', 'model', 'manual'].includes(organization.method) || !Array.isArray(organization.parts) || !organization.parts.length) {
    throw new Error('Your thought could not be sorted. Your draft is still here; please try again.');
  }
  const parts = organization.parts.map((part) => {
    if (!Number.isInteger(part.start) || !Number.isInteger(part.end) || part.start < 0 || part.end > text.length || part.start >= part.end || !text.slice(part.start, part.end).trim()) {
      throw new Error('Sorting returned an invalid thought. Your draft has been kept.');
    }
    return { ...part, category: cleanCategory(part.category) };
  }).sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const part of parts) {
    if (part.start < cursor || text.slice(cursor, part.start).trim()) throw new Error('Sorting missed part of your thought. Your draft has been kept.');
    cursor = part.end;
  }
  if (text.slice(cursor).trim()) throw new Error('Sorting missed part of your thought. Your draft has been kept.');
  return { ...organization, parts };
}
