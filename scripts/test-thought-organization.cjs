// Compile only the platform-independent logic; no native runtime or extra dependencies needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(filename, module);
  const requireLocal = (name) => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), name + '.ts'))) : require(name);
  new Function('require', 'module', 'exports', output)(requireLocal, module, module.exports);
  return module.exports;
}
const organizer = load('src/services/thought-organizer.ts');
const store = load('src/state/thought-store.ts');
const layout = load('src/services/bubble-layout.ts');

async function main() {
  const input = 'I miss my mom. My exams are tomorrow! My boss added a deadline. I want to practise guitar. I feel something I cannot explain 💚';
  const result = organizer.validateOrganization(input, await organizer.organizePreview(input, []));
  assert.deepEqual(result.parts.map((part) => part.category), ['Family', 'School', 'Work', 'Hobbies', 'Unsorted']);
  let data = store.appendThoughtDump(store.emptyThoughtStore, { id: 'first', text: input, createdAt: 1, method: result.method }, result);
  assert.equal(data.categories.length, 5);
  assert.equal(data.dumps[0].text, input);
  assert.equal(data.thoughts[4].text, 'I feel something I cannot explain 💚');
  const next = 'My job is tiring. I need to pay rent. My doctor called.';
  data = store.appendThoughtDump(data, { id: 'second', text: next, createdAt: 2, method: 'preview' }, organizer.validateOrganization(next, await organizer.organizePreview(next, data.categories)));
  assert.equal(data.categories.length, 7);
  assert.equal(data.categories.filter((category) => category.label === 'Work').length, 1);
  assert.equal(data.thoughts.filter((thought) => thought.categoryId === 'category:work').length, 2);
  const custom = 'I would like a quiet afternoon.';
  data = store.appendThoughtDump(data, { id: 'custom', text: custom, createdAt: 3, method: 'manual' }, organizer.validateOrganization(custom, organizer.organizeManually(custom, '  Creative   Space  ')));
  data = store.appendThoughtDump(data, { id: 'custom-again', text: custom, createdAt: 4, method: 'manual' }, organizer.validateOrganization(custom, organizer.organizeManually(custom, 'creative space')));
  assert.equal(data.categories.filter((category) => category.id === 'category:creative space').length, 1);
  assert.equal(organizer.cleanCategory(' FINANCES '), 'Money');
  assert.equal(organizer.cleanCategory('學習'), '學習');
  assert.equal(organizer.categoryKey('Ｗｏｒｋ'), 'work');
  assert.equal((await organizer.organizePreview('I bought a friendship bracelet.', [])).parts[0].category, 'Friends');
  assert.equal((await organizer.organizePreview('My school exam worries me.', [])).parts[0].category, 'School');
  assert.equal((await organizer.organizePreview('School exams and work deadlines are overwhelming.', [])).parts[0].category, 'Unsorted');
  const decimal = 'My rent is 2.50.\nI need sleep; My doctor is busy.';
  assert.equal(organizer.sentenceSpans(decimal).length, 3);
  assert.throws(() => organizer.validateOrganization(input, { method: 'model', parts: [{ start: 0, end: 14, category: 'Family' }] }), /missed/);
  assert.throws(() => organizer.validateOrganization('hello', { method: 'model', parts: [{ start: 0, end: 5, category: 'Test' }, { start: 2, end: 5, category: 'Test' }] }), /missed/);
  assert.throws(() => organizer.validateOrganization('hello', { method: 'model', parts: [{ start: 0, end: 8, category: 'Test' }] }), /invalid/);
  assert.throws(() => organizer.cleanCategory('???'));
  for (let count = 1; count <= 50; count++) {
    const positions = Array.from({ length: count }, (_, index) => layout.bubblePosition(index, count, 10000));
    for (const [index, position] of positions.entries()) {
      assert(position.x - position.radius >= 0 && position.x + position.radius <= 340, `horizontal bounds: ${count}/${index}`);
      assert(position.y - position.radius >= 0 && position.y + position.radius <= layout.bubbleCanvasHeight(count), `vertical bounds: ${count}/${index}`);
      for (const other of positions.slice(index + 1)) assert(Math.hypot(position.x - other.x, position.y - other.y) > position.radius + other.radius, `overlap: ${count}/${index}`);
    }
  }
  console.log('Thought organization checks passed: splitting, category reuse/creation, original text, uncertain topics, validation, and 1–50 bubble layouts.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
