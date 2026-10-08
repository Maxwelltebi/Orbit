const assert = require('node:assert/strict');
const load = require('./lib/load-ts.cjs');
const { clearLocalCategory, buildHybridPlan, completeHybridPlan } = load('src/services/hybrid-classifier.ts');
const { categoryTestText, categoryTestRequest, evaluateCategoryTest } = load('src/services/gemma-category-test.ts');
const plan = buildHybridPlan(categoryTestText);
assert.deepEqual(plan.local.map((item) => item.id), [1, 2, 5, 6]);
assert.deepEqual(plan.requests.flatMap((request) => request.units.map((unit) => unit.id)), [3, 4]);
assert.ok(plan.requests[0].prompt.length < categoryTestRequest.prompt.length);
assert.equal(clearLocalCategory('My upcoming maths exam makes me nervous.'), 2);
assert.equal(clearLocalCategory('My salary has not arrived.'), 3);
assert.equal(clearLocalCategory('I am worried about tomorrow.'), 10);
assert.equal(clearLocalCategory('I feel sad.'), 15);
assert.equal(clearLocalCategory('I am not worried about tomorrow.'), null, 'Negated generic evidence must defer');
assert.equal(clearLocalCategory('Tomorrow is coming.'), null, 'Date words alone do not mean Future');

assert.equal(clearLocalCategory('Our puppy needs some attention.'), 40);
assert.equal(clearLocalCategory('I keep procrastinating.'), 46);
for (const text of [
  'I worry about my family and my rent.', 'I want to learn to paint.',
  'My work and college assignments clash.', 'I feel uneasy about everything.',
  'I have no idea what any of this means.',
]) assert.equal(clearLocalCategory(text), null, 'Defer competing or unknown topics to the model: ' + text);

const completed = completeHybridPlan(plan, ['{"3":11,"4":1}']);
const result = evaluateCategoryTest(completed, plan.local.map((item) => item.id));
assert.equal(result.topicMatches, 6);
assert.equal(result.localCount, 4);
assert.equal(result.modelCount, 2);
assert.equal(result.modelMatches, 2);
assert.deepEqual(result.items.map((item) => item.method), ['local', 'local', 'model', 'model', 'local', 'local']);
const wrong = evaluateCategoryTest(completeHybridPlan(plan, ['{"3":42,"4":1}']), plan.local.map((item) => item.id));
assert.equal(wrong.topicMatches, 5, 'A wrong model decision is not overwritten by local rules');
assert.equal(wrong.modelMatches, 1, 'Model-only accuracy remains honest');
assert.equal(wrong.items[2].category, 'Entertainment');
assert.equal(evaluateCategoryTest(completeHybridPlan(plan, ['{"3":0,"4":1}']), plan.local.map((item) => item.id)).modelMatches, 1);
assert.throws(() => completeHybridPlan(plan, []));
assert.throws(() => completeHybridPlan(plan, ['{"3":999,"4":1}']));
assert.throws(() => completeHybridPlan(plan, ['{"1":1,"3":11,"4":1}']), 'Model cannot override or resubmit locally assigned IDs');

const allLocal = buildHybridPlan('My exams are tomorrow. I miss my sister.');
assert.equal(allLocal.requests.length, 0, 'Do not request a model when all topics are unambiguous');
assert.deepEqual(JSON.parse(completeHybridPlan(allLocal, [])), { 1: 2, 2: 1 });
const allAmbiguous = buildHybridPlan('Something feels off. I worry about my rent and my family.');
assert.equal(allAmbiguous.local.length, 0);
assert.equal(allAmbiguous.requests[0].units.length, 2);
const long = buildHybridPlan(Array.from({ length: 20 }, (_, index) => index % 2 ? 'I miss my sister.' : 'My job affects my rent.').join(' '));
assert.ok(long.requests.length > 1);
const responses = long.requests.map((request) => JSON.stringify(Object.fromEntries(request.units.map((unit) => [unit.id, 0]))));
const combined = JSON.parse(completeHybridPlan(long, responses));
assert.equal(Object.keys(combined).length, 20, 'Retain all thoughts across partial local/model batches');
assert.equal(Object.values(combined).filter((id) => id === 1).length, 10);
assert.equal(Object.values(combined).filter((id) => id === 0).length, 10);
console.log('Hybrid checks passed: conservative local matches, ambiguity, no-model cases, source coverage, and separate model-only scoring.');
console.log('Fixture: 4 local items; 2 model items; model prompt ' + plan.requests[0].prompt.length + ' characters versus ' + categoryTestRequest.prompt.length + ' for the all-model baseline.');
