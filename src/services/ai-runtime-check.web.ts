import type { RuntimeCheck } from './ai-runtime-types';

// Keep native AI modules out of the browser bundle.
export async function checkAiRuntime(): Promise<RuntimeCheck> {
  return { status: 'unavailable', message: 'On-device AI is available in the installed ORBIT mobile app. Test this step on your tablet.' };
}
