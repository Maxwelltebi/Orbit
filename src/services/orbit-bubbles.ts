// Prompt, categories and output rules for the fine-tuned Orbit sorter model.
// A port of lora_fine_tuning_orbit_model/orbit_schema.py: the prompt must match
// training exactly, and every bubble text must be copied verbatim from the entry.

export const sorterInstruction = "Sort this journal entry into category bubbles. Use only the writer's exact words. Return JSON.";

export const sorterCategories = [
  'Work', 'School', 'Money', 'Family', 'Relationships', 'Friends', 'Health & Body', 'Feelings', 'Worries',
  'Self-Reflection', 'Goals & Plans', 'Gratitude', 'Hobbies & Creativity', 'Faith & Spirituality', 'Daily Life',
  'Grief & Loss', 'Other',
] as const;
export type SorterCategory = (typeof sorterCategories)[number];
export interface Bubble { category: SorterCategory; texts: string[] }

const known = new Set<string>(sorterCategories);
const word = /[\p{L}\p{N}\p{M}_]/u;
const sentenceEnd = /[.!?…][^\p{L}\p{N}\p{M}_]*$/u;
const mergeBlocker = /[\p{L}\p{N}\p{M}_.!?…]/u;
const sentencePattern = () => /[\s\S]+?(?:[.!?…]+(?=\s|$)|$)/g;

// Training entries were at most ~440 tokens with their reply; stay well inside that
// and inside the app's 1024-token context (prompt + copied text + JSON).
export const sorterEntryLimit = 800;
export const sorterOutputTokens = 640;

export function validateSorterEntry(entry?: string): string {
  if (typeof entry !== 'string' || !entry.trim()) throw new Error('Write a journal entry before sorting.');
  if (entry.length > sorterEntryLimit) throw new Error('Keep this test to ' + sorterEntryLimit + ' characters or fewer.');
  return entry;
}

export function sorterPrompt(entry: string): string {
  return sorterInstruction + '\n\n' + entry;
}

// Give each span a non-overlapping position, earliest first; null if impossible.
function locate(entry: string, spans: string[]): [number, number][] | null {
  const order = spans.map((_, index) => index).sort((a, b) => entry.indexOf(spans[a]) - entry.indexOf(spans[b]));
  const taken: [number, number][] = [];
  const result: [number, number][] = new Array(spans.length);
  for (const index of order) {
    const span = spans[index];
    let position = entry.indexOf(span);
    while (position !== -1 && taken.some(([start, end]) => position < end && position + span.length > start)) {
      position = entry.indexOf(span, position + 1);
    }
    if (position === -1) return null;
    taken.push([position, position + span.length]);
    result[index] = [position, position + span.length];
  }
  return result;
}

/** Validate bubbles. Returns canonical bubbles, or the reason they break a rule. */
export function checkBubbles(entry: string, bubbles: unknown): { bubbles: Bubble[] } | { problem: string } {
  if (!entry.trim()) return { problem: 'empty entry' };
  if (!Array.isArray(bubbles) || !bubbles.length) return { problem: 'no bubbles' };
  const seen = new Set<string>();
  const flat: { category: SorterCategory; text: string }[] = [];
  for (const bubble of bubbles) {
    if (!bubble || typeof bubble !== 'object' || Object.keys(bubble).sort().join() !== 'category,texts') return { problem: 'malformed bubble' };
    const { category, texts } = bubble as { category: unknown; texts: unknown };
    if (typeof category !== 'string' || !known.has(category)) return { problem: 'unknown category: ' + String(category) };
    if (seen.has(category)) return { problem: 'duplicate category bubble: ' + category };
    seen.add(category);
    if (!Array.isArray(texts) || !texts.length) return { problem: 'empty bubble: ' + category };
    for (const text of texts) {
      if (typeof text !== 'string' || !text.trim()) return { problem: 'empty text in ' + category };
      if (text !== text.trim()) return { problem: 'leading/trailing whitespace' };
      if (!entry.includes(text)) return { problem: 'not an exact substring: ' + text };
      flat.push({ category: category as SorterCategory, text });
    }
  }
  const positions = locate(entry, flat.map((item) => item.text));
  if (!positions) return { problem: 'spans overlap or reuse the same words' };

  const covered = new Array<boolean>(entry.length).fill(false);
  for (const [start, end] of positions) covered.fill(true, start, end);
  // UTF-16 indexes throughout, the same unit indexOf uses.
  let leftOut = '';
  for (let index = 0; index < entry.length; index++) if (!covered[index]) leftOut += entry[index];
  if (word.test(leftOut)) return { problem: 'words left out of every bubble: ' + leftOut.trim() };

  // Merge neighbouring same-category spans inside one sentence.
  const pieces = flat.map((item, index) => ({ start: positions[index][0], end: positions[index][1], category: item.category }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: typeof pieces = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && last.category === piece.category && !mergeBlocker.test(entry.slice(last.end, piece.start)) && !sentenceEnd.test(entry.slice(last.start, last.end))) {
      last.end = piece.end;
      continue;
    }
    merged.push({ ...piece });
  }
  const byCategory = new Map<SorterCategory, string[]>();
  for (const { start, end, category } of merged) byCategory.set(category, [...(byCategory.get(category) ?? []), entry.slice(start, end)]);
  return { bubbles: [...byCategory].map(([category, texts]) => ({ category, texts })) };
}

function sentences(entry: string): [number, number][] {
  const result: [number, number][] = [];
  for (const match of entry.matchAll(sentencePattern())) {
    let start = match.index;
    let end = start + match[0].length;
    while (start < end && /\s/.test(entry[start])) start++;
    while (end > start && /\s/.test(entry[end - 1])) end--;
    if (word.test(entry.slice(start, end))) result.push([start, end]);
  }
  return result;
}

// Ratcliff/Obershelp similarity, the algorithm behind Python's difflib ratio.
function similarity(a: string, b: string): number {
  const matching = (a0: number, a1: number, b0: number, b1: number): number => {
    let best = 0, bestA = a0, bestB = b0;
    let previous = new Array<number>(b1 - b0 + 1).fill(0);
    for (let i = a0; i < a1; i++) {
      const current = new Array<number>(b1 - b0 + 1).fill(0);
      for (let j = b0; j < b1; j++) {
        if (a[i] === b[j]) {
          current[j - b0 + 1] = previous[j - b0] + 1;
          if (current[j - b0 + 1] > best) { best = current[j - b0 + 1]; bestA = i - best + 1; bestB = j - best + 1; }
        }
      }
      previous = current;
    }
    if (!best) return 0;
    return best + matching(a0, bestA, b0, bestB) + matching(bestA + best, a1, bestB + best, b1);
  };
  const total = a.length + b.length;
  return total ? (2 * matching(0, a.length, 0, b.length)) / total : 1;
}

/**
 * Turn a near-miss reply into bubbles that pass checkBubbles, keeping the model's
 * category choices: rewritten spans snap to the closest sentence, repeated words go
 * to the first bubble that claimed them, duplicate bubbles merge, unknown categories
 * become Other, and left-out words join the bubble before them (or after, at the start).
 * Valid replies come back unchanged. Returns null when nothing can be placed.
 */
export function repairBubbles(entry: string, bubbles: unknown): Bubble[] | null {
  if (!Array.isArray(bubbles)) return null;
  const valid = checkBubbles(entry, bubbles);
  if ('bubbles' in valid) return valid.bubbles;
  const spans = sentences(entry);
  const labels: (SorterCategory | null)[] = new Array(entry.length).fill(null);
  for (const bubble of bubbles) {
    if (!bubble || typeof bubble !== 'object') continue;
    const raw = bubble as { category?: unknown; texts?: unknown; text?: unknown };
    const category: SorterCategory = typeof raw.category === 'string' && known.has(raw.category) ? raw.category as SorterCategory : 'Other';
    const texts = raw.texts ?? raw.text ?? [];
    for (const item of typeof texts === 'string' ? [texts] : Array.isArray(texts) ? texts : []) {
      const text = typeof item === 'string' ? item.trim() : '';
      if (!word.test(text)) continue;
      let start = entry.indexOf(text);
      while (start !== -1 && labels[start] !== null && entry.indexOf(text, start + 1) !== -1) start = entry.indexOf(text, start + 1);
      let end = start + text.length;
      if (start === -1) {
        let best = 0;
        for (const [s, e] of spans) {
          const score = similarity(text.toLowerCase(), entry.slice(s, e).toLowerCase());
          if (score > best) { best = score; start = s; end = e; }
        }
        if (best < 0.75) continue;
      }
      for (let index = start; index < end; index++) labels[index] ??= category;
    }
  }
  const first = labels.find((label) => label !== null);
  if (!first) return null;
  let last: SorterCategory | null = null;
  for (let index = 0; index < labels.length; index++) last = labels[index] = labels[index] ?? last;
  for (let index = 0; index < labels.length; index++) labels[index] ??= first;

  const grouped = new Map<SorterCategory, string[]>();
  let runStart = 0;
  for (let index = 1; index <= entry.length; index++) {
    if (index < entry.length && labels[index] === labels[runStart]) continue;
    const run = entry.slice(runStart, index);
    for (const match of run.matchAll(sentencePattern())) {
      const text = match[0].trim();
      if (!word.test(text)) continue;
      const category = labels[runStart + match.index]!;
      grouped.set(category, [...(grouped.get(category) ?? []), text]);
    }
    runStart = index;
  }
  const repaired = checkBubbles(entry, [...grouped].map(([category, texts]) => ({ category, texts })));
  return 'bubbles' in repaired ? repaired.bubbles : null;
}

export type SorterReport =
  | { status: 'invalid'; message: string; raw: string }
  | { status: 'ok'; bubbles: Bubble[]; repaired: boolean; problem?: string; raw: string };

/** Read the model's raw reply the way the app will: validate, then repair if needed. */
export function readSorterReply(entry: string, raw: string): SorterReport {
  let bubbles: unknown;
  try {
    bubbles = (JSON.parse(raw) as { bubbles?: unknown }).bubbles;
  } catch {
    return { status: 'invalid', message: 'The model reply was not valid JSON.', raw };
  }
  const checked = checkBubbles(entry, bubbles);
  if ('bubbles' in checked) return { status: 'ok', bubbles: checked.bubbles, repaired: false, raw };
  const repaired = repairBubbles(entry, bubbles);
  if (!repaired) return { status: 'invalid', message: 'The reply could not be matched to your words (' + checked.problem + ').', raw };
  return { status: 'ok', bubbles: repaired, repaired: true, problem: checked.problem, raw };
}

// Long entries with many topic changes overwhelm the 270M model (training entries
// rarely had more than four categories), so the app can sort a few sentences at a time.
export const sorterWindowSentences = 3;
export const sorterWindowCharacters = 320;

/** Split an entry into consecutive windows of whole sentences (lines also end a sentence). */
export function sorterWindows(entry: string): string[] {
  const units: [number, number][] = [];
  let lineStart = 0;
  for (const line of entry.split('\n')) {
    for (const [start, end] of sentences(line)) units.push([lineStart + start, lineStart + end]);
    lineStart += line.length + 1;
  }
  const windows: string[] = [];
  let first = 0;
  for (let index = 0; index < units.length; index++) {
    const start = units[first][0];
    const next = units[index + 1];
    const full = index - first + 1 >= sorterWindowSentences;
    const tooLong = next !== undefined && next[1] - start > sorterWindowCharacters;
    if (!next || full || tooLong) {
      windows.push(entry.slice(start, units[index][1]));
      first = index + 1;
    }
  }
  return windows;
}

export interface SorterWindow { text: string; raw: string; repaired: boolean; problem?: string; failed: boolean }

/**
 * Sort each window separately and merge the bubbles. A window whose reply cannot be
 * used goes to Other, so no words are ever lost. Returns JSON with the merged bubbles
 * and every window's raw reply, readable by readSorterReply.
 */
export async function sortInWindows(entry: string, sortWindow: (text: string, index: number) => Promise<string>): Promise<string> {
  const results: SorterWindow[] = [];
  const merged: { category: SorterCategory; texts: string[] }[] = [];
  const add = (category: SorterCategory, texts: string[]) => {
    const bubble = merged.find((item) => item.category === category);
    if (bubble) bubble.texts.push(...texts);
    else merged.push({ category, texts: [...texts] });
  };
  for (const [index, text] of sorterWindows(entry).entries()) {
    const raw = await sortWindow(text, index);
    const report = readSorterReply(text, raw);
    if (report.status === 'ok') {
      for (const bubble of report.bubbles) add(bubble.category, bubble.texts);
      results.push({ text, raw, repaired: report.repaired, problem: report.problem, failed: false });
    } else {
      add('Other', [text]);
      results.push({ text, raw, repaired: false, problem: report.message, failed: true });
    }
  }
  const checked = checkBubbles(entry, merged);
  if (!('bubbles' in checked)) throw new Error('Merged bubbles broke a rule: ' + checked.problem);
  return JSON.stringify({ bubbles: checked.bubbles, windows: results });
}

/** Per-window details from a chunked reply, or null for a whole-entry reply. */
export function readSorterWindows(raw: string): SorterWindow[] | null {
  try {
    const windows = (JSON.parse(raw) as { windows?: unknown }).windows;
    return Array.isArray(windows) ? windows as SorterWindow[] : null;
  } catch {
    return null;
  }
}
