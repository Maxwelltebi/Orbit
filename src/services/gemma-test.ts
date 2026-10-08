import type { LLMConfig } from 'react-native-litert-lm';
import { categoryTestText, categoryTestRequest } from './gemma-category-test';
import { buildHybridPlan, completeHybridPlan } from './hybrid-classifier';
import { validateCustomSource } from './custom-sorting-test';
import { getNativeAi } from './ai-native-runtime';
import { createGemmaTester } from './gemma-test-runner';

const MODEL_FILE = 'gemma3-270m-it-q8.litertlm';
const MODEL_BYTES = 304005120;
const baseConfig: LLMConfig = {
  backend: 'cpu', maxContextTokens: 512, maxOutputTokens: 64,
  temperature: 0.2, topK: 20, topP: 0.9, multimodal: false,
};
export const gemmaTester = createGemmaTester((kind, source) => {
  const prepStarted = performance.now();
  const text = kind === 'custom' ? validateCustomSource(source) : categoryTestText;
  const plan = kind === 'hybrid' || kind === 'custom' ? buildHybridPlan(text) : undefined;
  const routing = plan ? {
    localIds: plan.local.map((item) => item.id),
    modelIds: plan.requests.flatMap((request) => request.units.map((item) => item.id)),
    preparationMs: performance.now() - prepStarted,
    promptCharacters: plan.requests.reduce((sum, request) => sum + request.prompt.length, 0),
    offeredCategoryCount: new Set(plan.requests.flatMap((request) => request.units.flatMap((item) => item.candidateIds))).size,
  } : undefined;
  // All-local inputs never evaluate native code, load weights, or fake tokens.
  if (plan && !plan.requests.length) return {
    usedModel: false, routing,
    async load() {},
    async generate() { return completeHybridPlan(plan, []); },
    memory: () => ({ residentBytes: 0, availableMemoryBytes: 0 }),
    async release() {},
  };
  const categories = kind !== 'encouragement';
  const config: LLMConfig = categories
    ? { ...baseConfig, maxContextTokens: 1024, maxOutputTokens: categoryTestRequest.maxOutputTokens, temperature: 0, enableStructuredOutput: true }
    : baseConfig;
  const { createLLM, ModelRegistry } = getNativeAi();
  const path = ModelRegistry.getFilePath(MODEL_FILE);
  if (ModelRegistry.getFileSizeBytes(path) !== MODEL_BYTES) throw new Error('The Gemma 3 270M test model is missing or incomplete. Check that the downloaded model was copied into ORBIT.');
  const runtime = createLLM();
  try {
    const memory = runtime.getMemoryUsage();
    const estimate = runtime.estimateMemory(path, config);
    if (memory.isLowMemory || !estimate || estimate.verdict !== 'safe') throw new Error('There is not enough memory headroom for this test. Close other apps or restart the tablet, reopen ORBIT, and check again.');
  } catch (error) {
    runtime.close();
    throw error;
  }
  return {
    usedModel: true, routing,
    async load() {
      await runtime.loadModel(path, config);
      if (!runtime.isReady()) throw new Error('Gemma could not become ready on this device.');
    },
    async generate(onToken: (token: string) => void, isCancelled: () => boolean) {
      if (!categories) return runtime.execute([{ type: 'text', text: 'Reply with one short encouraging sentence for someone having a busy day.' }], (token) => onToken(token), { maxOutputTokens: 64 });
      const requests = plan?.requests ?? [categoryTestRequest];
      const responses: string[] = [];
      for (const [index, request] of requests.entries()) {
        if (isCancelled()) throw new Error('Sorting was interrupted before the next batch.');
        if (index > 0) runtime.resetConversation();
        responses.push(await runtime.execute([{ type: 'text', text: request.prompt }], (token) => onToken(token), { maxOutputTokens: request.maxOutputTokens, responseSchema: request.responseSchema }));
      }
      return plan ? completeHybridPlan(plan, responses) : responses[0];
    },
    memory: () => runtime.getMemoryUsage(),
    async release() {
      try { await runtime.unload(); } finally { runtime.close(); }
    },
  };
});
