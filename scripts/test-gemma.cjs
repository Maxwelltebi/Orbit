const assert = require('node:assert/strict');
const load = require('./lib/load-ts.cjs');
const { createGemmaTester } = load('src/services/gemma-test-runner.ts');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const memory = { residentBytes: 400, availableMemoryBytes: 900 };
function fake(overrides = {}) {
  const calls = [];
  const runtime = {
    async load() { calls.push('load'); },
    async generate(onToken) { calls.push('generate'); onToken('Hello'); return ' Hello '; },
    memory() { return memory; },
    async release() { calls.push('release'); },
    ...overrides,
  };
  return { calls, runtime };
}
(async () => {
  {
    const { calls, runtime } = fake();
    let clock = 0;
    const tester = createGemmaTester(() => runtime, 1000, () => ++clock);
    const phases = [];
    const unsubscribe = tester.subscribe((state) => phases.push(state.phase));
    await tester.start();
    unsubscribe();
    assert.deepEqual(calls, ['load', 'generate', 'release']);
    assert.deepEqual(phases, ['loading', 'generating', 'releasing', 'ready']);
    assert.equal(tester.getState().result.response, 'Hello');
    assert.equal(tester.getState().result.firstTokenMs, 1);
    assert.equal(tester.getState().busy, false);
  }
  {
    const loading = deferred();
    const { calls, runtime } = fake({ load() { calls.push('load'); return loading.promise; } });
    let created = 0;
    const tester = createGemmaTester(() => { created++; return runtime; }, 1000);
    const run = tester.start();
    await tester.start();
    assert.equal(created, 1, 'Prevent concurrent native loads');
    tester.cancel();
    assert.equal(tester.getState().busy, true);
    assert.deepEqual(calls, ['load'], 'Never release while loading');
    loading.resolve();
    await run;
    assert.deepEqual(calls, ['load', 'release'], 'No inference after cancelled load');
    assert.equal(tester.getState().busy, false);
    assert.equal(tester.getState().phase, 'error');
  }
  {
    const generation = deferred();
    const releasing = deferred();
    const { calls, runtime } = fake({
      generate() { calls.push('generate'); return generation.promise; },
      release() { calls.push('release'); return releasing.promise; },
    });
    const tester = createGemmaTester(() => runtime, 10);
    const run = tester.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(tester.getState().phase, 'error', 'Replace indefinite progress with timeout');
    assert.equal(tester.getState().busy, true, 'Timeout must not allow concurrent inference');
    assert.deepEqual(calls, ['load', 'generate'], 'No unload during active inference');
    generation.resolve('Late response');
    await tick();
    assert.equal(tester.getState().busy, true, 'Retain ownership until cleanup resolves');
    assert.equal(tester.getState().result, undefined, 'Discard a late response');
    releasing.resolve();
    await run;
    assert.equal(tester.getState().busy, false);
    assert.match(tester.getState().message, /exceeded two minutes/);
  }
  {
    const { calls, runtime } = fake({ async generate() { calls.push('generate'); throw new Error('inference failed'); } });
    const tester = createGemmaTester(() => runtime);
    await tester.start();
    assert.deepEqual(calls, ['load', 'generate', 'release']);
    assert.equal(tester.getState().message, 'inference failed');
  }
  {
    const { calls, runtime } = fake({ async load() { calls.push('load'); throw new Error('bad model'); } });
    const tester = createGemmaTester(() => runtime);
    await tester.start();
    assert.deepEqual(calls, ['load', 'release']);
    assert.equal(tester.getState().message, 'bad model');
  }
  {
    const tester = createGemmaTester(() => { throw new Error('not enough memory'); });
    await tester.start();
    assert.equal(tester.getState().busy, false);
    assert.equal(tester.getState().message, 'not enough memory');
  }
  {
    const { runtime } = fake({ async generate() { return '  '; } });
    const tester = createGemmaTester(() => runtime);
    await tester.start();
    assert.equal(tester.getState().phase, 'error');
    assert.match(tester.getState().message, /empty response/);
  }
  {
    const { calls, runtime } = fake({ async release() { calls.push('release'); throw new Error('cleanup failed'); } });
    const tester = createGemmaTester(() => runtime);
    await tester.start();
    const before = [...calls];
    await tester.start();
    assert.equal(tester.getState().busy, true, 'Failed cleanup blocks another test until app restart');
    assert.deepEqual(calls, before);
  }
  {
    const loading = deferred();
    const { runtime } = fake({ load() { return loading.promise; } });
    const received = [];
    const tester = createGemmaTester((request) => { received.push(request); return runtime; });
    const first = { entry: '  My job affects my rent.  ', model: 'orbit-sorter-v3.litertlm' };
    const run = tester.start(first);
    await tester.start({ entry: 'A different later input.', model: 'orbit-sorter-v4.litertlm' });
    assert.deepEqual(received, [first], 'One native resource lock: a blocked start cannot replace the active request');
    assert.deepEqual(tester.getState().request, first);
    loading.resolve();
    await run;
    assert.deepEqual(tester.getState().result.request, first, 'Associate results with the exact submitted entry and model');
    const second = { entry: 'Next entry.', model: 'orbit-sorter-v4.litertlm' };
    await tester.start(second);
    assert.deepEqual(received, [first, second]);
    assert.deepEqual(tester.getState().result.request, second);
  }
  {
    const firstBatch = deferred();
    let finished = false;
    const { runtime, calls } = fake({
      async generate(onToken, isCancelled) {
        await firstBatch.promise;
        if (isCancelled()) throw new Error('interrupted');
        finished = true;
        return 'done';
      },
    });
    const tester = createGemmaTester(() => runtime);
    const run = tester.start({ entry: 'x', model: 'orbit-sorter-v3.litertlm' });
    await tick();
    tester.cancel();
    firstBatch.resolve();
    await run;
    assert.equal(finished, false, 'Stop work after background/timeout');
    assert.equal(calls.at(-1), 'release');
    assert.equal(tester.getState().busy, false);
  }
  console.log('Model test lifecycle checks passed: success, concurrency, cancellation, timeout, errors, and cleanup.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
