import type { LLMConfig } from 'react-native-litert-lm';
import { getNativeAi } from './ai-native-runtime';
import { createGemmaTester } from './gemma-test-runner';
import { sorterOutputTokens, sorterPrompt, validateSorterEntry } from './orbit-bubbles';

// Fine-tuned models are copied into the app with adb as orbit-sorter-<version>.litertlm.
const sorterFile = /^orbit-sorter-.+\.litertlm$/;
// A complete int8 Gemma 3 270M export is ~290 MB; anything far smaller is a partial copy.
const minimumBytes = 200 * 1024 ** 2;

export interface SorterModel { fileName: string; sizeBytes: number; lastModifiedMs: number }

/** Fine-tuned sorter models saved on this device, newest first. */
export function listSorterModels(): SorterModel[] {
  const { ModelRegistry } = getNativeAi();
  return ModelRegistry.listCachedFiles()
    .filter((file) => sorterFile.test(file.fileName))
    .map(({ fileName, sizeBytes, lastModifiedMs }) => ({ fileName, sizeBytes, lastModifiedMs }))
    .sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
}

// Greedy decoding with the exact training prompt; no JSON schema, because LiteRT's
// grammar engine rejects the '&' in category names. The app validates and repairs instead.
const config: LLMConfig = {
  backend: 'cpu', maxContextTokens: 1024, maxOutputTokens: sorterOutputTokens,
  temperature: 0, topK: 20, topP: 0.9, multimodal: false,
};

export const sorterTester = createGemmaTester((request) => {
  if (!request || !sorterFile.test(request.model)) throw new Error('Choose a fine-tuned sorter model first.');
  const entry = validateSorterEntry(request.entry);
  const { createLLM, ModelRegistry } = getNativeAi();
  const path = ModelRegistry.getFilePath(request.model);
  if (ModelRegistry.getFileSizeBytes(path) < minimumBytes) {
    throw new Error(request.model + ' is missing or incomplete. Copy it into ORBIT again with adb.');
  }
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
    async load() {
      await runtime.loadModel(path, config);
      if (!runtime.isReady()) throw new Error('The sorter model could not become ready on this device.');
    },
    generate(onToken: (token: string) => void) {
      return runtime.execute([{ type: 'text', text: sorterPrompt(entry) }], (token) => onToken(token), { maxOutputTokens: sorterOutputTokens });
    },
    memory: () => runtime.getMemoryUsage(),
    async release() {
      try { await runtime.unload(); } finally { runtime.close(); }
    },
  };
});
