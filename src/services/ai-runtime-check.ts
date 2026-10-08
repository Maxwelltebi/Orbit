import { Platform, TurboModuleRegistry } from 'react-native';
import { getNativeAi } from './ai-native-runtime';
import type { RuntimeCheck } from './ai-runtime-types';

export async function checkAiRuntime(): Promise<RuntimeCheck> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return { status: 'unavailable', message: 'Test on a phone or tablet using the installed ORBIT development app.' };
  }
  try {
    // Do not evaluate Nitro/LiteRT at startup or in Expo Go, where they are absent.
    if (!TurboModuleRegistry.get('NitroModules')) {
      return { status: 'unavailable', message: 'Open the installed ORBIT development app. The AI runtime is not included in Expo Go.' };
    }
    const { createLLM, ModelRegistry } = getNativeAi();
    const runtime = createLLM();
    try {
      // Native OS memory readings work without downloading or loading any weights.
      const memory = runtime.getMemoryUsage();
      return {
        status: 'ready',
        availableMemoryBytes: memory.availableMemoryBytes,
        residentBytes: memory.residentBytes,
        isLowMemory: memory.isLowMemory,
        cachedModelCount: ModelRegistry.listCachedFiles().length,
        checkedAt: Date.now(),
      };
    } finally {
      runtime.close();
    }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'The AI runtime check failed. Please try again.' };
  }
}
