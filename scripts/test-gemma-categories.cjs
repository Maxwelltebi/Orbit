const assert = require('node:assert/strict');
const load = require('./lib/load-ts.cjs');
const { evaluateCategoryTest, categoryTestText, categoryTestCases, categoryTestRequest } = load('src/services/gemma-category-test.ts');
const { categoryCatalogue } = load('src/services/category-catalogue.ts');
const { shortlistCategories, buildCategoryRequests, parseCategoryResponse, combineCategoryResponses, classificationLimits } = load('src/services/category-classifier.ts');
const answers = { 1: 1, 2: 2, 3: 11, 4: 1, 5: 2, 6: 12 };
const encoded = JSON.stringify(answers);
const report = evaluateCategoryTest(encoded);
assert.equal(report.status, 'review');
assert.equal(report.topicMatches, 6);
assert.equal(report.items.map((item) => item.text).join(' '), categoryTestText);
assert.deepEqual(report.items.map((item) => item.isNew), [false, false, true, false, false, true]);
assert.equal(new Set(categoryCatalogue.map((category) => category.id)).size, categoryCatalogue.length);
assert.equal(new Set(categoryCatalogue.map((category) => category.label)).size, categoryCatalogue.length);
assert.equal(categoryCatalogue.length, 51);

for (const [index, sample] of categoryTestCases.entries()) {
  const unit = categoryTestRequest.units[index];
  assert.ok(unit.candidateIds.some((id) => sample.acceptedIds.includes(id)), 'Retrieval must offer the relevant sample topic');
  const schema = JSON.parse(categoryTestRequest.responseSchema);
  assert.deepEqual(schema.properties[String(unit.id)].enum, unit.candidateIds, 'Each item has its own allowed IDs');
}
for (const [text, id] of [
  ['My salary did not arrive.', 3], ['The landlord increased rent.', 3], ['Our puppy needs a vet.', 40],
  ['I feel excluded from the group.', 26], ['My boundaries are ignored.', 35], ['My migraine medication worries me.', 5],
  ['I want to volunteer in our neighbourhood.', 32], ['I am struggling with my life purpose.', 49],
  ['I keep comparing myself to others.', 14], ['I am procrastinating again.', 46],
]) assert.ok(shortlistCategories(text).includes(id), 'Offer a relevant category for: ' + text);
assert.ok(!shortlistCategories('My exams are next week.').includes(9), 'Date words must not retrieve Future by themselves');
assert.ok(!shortlistCategories('My sister needs me tomorrow.').includes(1 + 100), 'IDs must come from the catalogue');
for (const text of ['No obvious words here.', 'I had a difficult day.', categoryTestText]) {
  const choices = shortlistCategories(text);
  assert.ok(choices.includes(0), 'Other must always be available');
  assert.ok(choices.length <= classificationLimits.candidates + 1);
  assert.equal(new Set(choices).size, choices.length);
}
for (const invalid of [
  'not json', '{', 'null', '[]', '{}',
  JSON.stringify({ ...answers, 7: 0 }),
  JSON.stringify({ ...answers, 1: 'Family' }),
  JSON.stringify({ ...answers, 1: '1' }),
  JSON.stringify({ ...answers, 1: 1.5 }),
  JSON.stringify({ ...answers, 1: 999 }),
  JSON.stringify({ ...answers, 1: 2 }), // valid catalogue ID, not allowed for item 1
  JSON.stringify({ ...answers, 1: null }),
  '{"1":1,"1":6,"2":2,"3":11,"4":1,"5":2,"6":12}',
  '{"1":1,"\\u0031":6,"2":2,"3":11,"4":1,"5":2,"6":12}',
  JSON.stringify({ assignments: categoryTestCases.map((sample, index) => ({ id: index + 1, category: sample.expected })) }),
]) assert.equal(evaluateCategoryTest(invalid).status, 'invalid', 'Reject disallowed or malformed output: ' + invalid);
const missing = { ...answers }; delete missing[2];
assert.equal(evaluateCategoryTest(JSON.stringify(missing)).status, 'invalid');
const allOther = evaluateCategoryTest(JSON.stringify(Object.fromEntries(Object.keys(answers).map((key) => [key, 0]))));
assert.equal(allOther.status, 'review', 'Other is allowed, not a parsing failure');
assert.equal(allOther.topicMatches, 0, 'Valid IDs do not imply correct topic choices');
assert.ok(allOther.items.every((item) => item.category === 'Other'), 'Never overwrite the model choice with a rule');
const wrong = evaluateCategoryTest(JSON.stringify({ ...answers, 2: 4 }));
assert.equal(wrong.topicMatches, 5, 'Display wrong-but-allowed choices honestly');
assert.equal(wrong.items[1].category, 'Work');
const reversed = JSON.stringify(Object.fromEntries(Object.entries(answers).reverse()));
assert.deepEqual(parseCategoryResponse(categoryTestRequest, reversed).map((part) => part.categoryId), Object.values(answers));

// Long unpunctuated dumps, decimal numbers, and emoji must keep every original
// non-whitespace character while batching bounded prompts and responses.
for (const source of [
  ' I owe 12.50 in rent.\nMy parents called.\nI cannot sleep! ',
  Array.from({ length: 30 }, () => 'My exams are tomorrow.').join(' '),
  Array.from({ length: 150 }, () => 'A thought about my family').join(' '),
  String.fromCodePoint(0x1f600).repeat(701),
]) {
  const requests = buildCategoryRequests(source);
  for (const request of requests) {
    assert.ok(request.units.length <= classificationLimits.items);
    assert.ok(request.units.reduce((sum, unit) => sum + unit.text.length, 0) <= classificationLimits.batchCharacters);
    assert.ok(request.units.every((unit) => unit.text.length <= classificationLimits.itemCharacters));
    for (const unit of request.units) {
      assert.equal(unit.text, source.slice(unit.start, unit.end));
      assert.ok(!/[\uD800-\uDBFF]$/.test(unit.text), 'Do not split a surrogate pair');
    }
  }
  const responses = requests.map((request) => JSON.stringify(Object.fromEntries(request.units.map((unit) => [unit.id, 0]))));
  const organized = combineCategoryResponses(source, requests, responses);
  assert.equal(organized.parts.map((part) => source.slice(part.start, part.end)).join('').replace(/\s/g, ''), source.replace(/\s/g, ''), 'No words are truncated or invented');
  if (requests.length > 1) assert.throws(() => combineCategoryResponses(source, requests, responses.slice(1)));
}
assert.throws(() => buildCategoryRequests('   '));
const oldFormat = JSON.stringify({ assignments: Object.entries(answers).map(([id, categoryId]) => ({ id: Number(id), category: categoryCatalogue.find((category) => category.id === categoryId).label })) });
assert.ok(encoded.length < oldFormat.length / 3, 'Compact IDs substantially reduce response text');
console.log('Constrained category checks passed: catalogue coverage, retrieval, per-item IDs, duplicate rejection, fallback, bounded batching, and exact source preservation.');
console.log('Fixture: ' + categoryTestRequest.offeredCategoryCount + '/51 categories offered; ' + categoryTestRequest.prompt.length + ' prompt characters; compact response ' + encoded.length + ' characters versus ' + oldFormat.length + ' in the earlier format.');
