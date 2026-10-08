export type GemmaTestKind = 'encouragement' | 'categories' | 'hybrid' | 'custom';

export interface TestMemory {
  availableMemoryBytes: number;
  residentBytes: number;
}
export interface HybridTestDetails {
  localIds: number[]; modelIds: number[]; preparationMs: number; promptCharacters: number; offeredCategoryCount: number;
}
export interface GemmaTestResult {
  usedModel: boolean;
  totalMs: number;
  routing?: HybridTestDetails;
  kind: GemmaTestKind;
  response: string;
  source?: string;
  loadMs: number;
  generationMs: number;
  firstTokenMs: number | null;
  loadedMemory: TestMemory;
  generatedMemory: TestMemory;
}
export interface GemmaTestState {
  kind?: GemmaTestKind;
  phase: 'idle' | 'loading' | 'generating' | 'releasing' | 'ready' | 'error';
  busy: boolean;
  message?: string;
  result?: GemmaTestResult;
}
export interface TestRuntime {
  usedModel?: boolean;
  routing?: HybridTestDetails;
  load(): Promise<void>;
  generate(onToken: (token: string) => void, isCancelled: () => boolean): Promise<string>;
  memory(): TestMemory;
  release(): Promise<void>;
}

// Own the native instance until its operation AND cleanup settle. A timeout ends
// the UI wait, not the native operation: this SDK has no cancellation API.
export function createGemmaTester(
  prepare: (kind: GemmaTestKind, source?: string) => TestRuntime,
  timeoutMs = 120000,
  now: () => number = () => performance.now(),
) {
  let state: GemmaTestState = { phase: 'idle', busy: false };
  let activeKind: GemmaTestKind | undefined;
  const listeners = new Set<(state: GemmaTestState) => void>();
  let abandon: ((message: string) => void) | undefined;
  const publish = (next: GemmaTestState) => {
    state = { ...next, kind: activeKind };
    listeners.forEach((listener) => listener(state));
  };

  const start = async (kind: GemmaTestKind = 'encouragement', source?: string): Promise<void> => {
    if (state.busy) return;
    activeKind = kind;
    const started = now();
    let abandoned = false;
    let runtime: TestRuntime | undefined;
    let outcome: GemmaTestResult | undefined;
    let error: string | undefined;
    let cleanupFailed = false;
    let interruption: string | undefined;
    abandon = (message) => {
      if (abandoned) return;
      abandoned = true;
      interruption = message;
      publish({ phase: 'error', busy: true, message });
    };
    publish({ phase: 'loading', busy: true });
    const timer = setTimeout(() => abandon?.('The test exceeded two minutes. The native runtime is still finishing; another test is blocked until it releases the model. If this persists, close ORBIT completely and reopen it.'), timeoutMs);
    try {
      runtime = prepare(kind, source);
      const loadStarted = now();
      await runtime.load();
      const loadMs = now() - loadStarted;
      if (abandoned) return;
      const loadedMemory = runtime.memory();
      publish({ phase: 'generating', busy: true });
      const generationStarted = now();
      let firstTokenMs: number | null = null;
      const response = await runtime.generate((token) => {
        if (token.trim() && firstTokenMs === null) firstTokenMs = now() - generationStarted;
      }, () => abandoned);
      if (abandoned) return;
      if (!response.trim()) throw new Error('Gemma returned an empty response. Please try again.');
      outcome = {
        usedModel: runtime.usedModel !== false, totalMs: 0, routing: runtime.routing,
        kind, source: kind === 'custom' ? source : undefined, response: response.trim(), loadMs, generationMs: now() - generationStarted,
        firstTokenMs, loadedMemory, generatedMemory: runtime.memory(),
      };
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'The Gemma test failed. Please try again.';
    } finally {
      if (runtime) {
        if (!abandoned) publish({ phase: 'releasing', busy: true });
        try {
          // Never unload concurrently with a load or generation call.
          await runtime.release();
        } catch (caught) {
          const detail = caught instanceof Error ? caught.message : 'Unknown cleanup error';
          cleanupFailed = true;
          error = 'Could not release the model. Close ORBIT completely before trying again. ' + detail;
        }
      }
      clearTimeout(timer);
      abandon = undefined;
      if (cleanupFailed) {
        publish({ phase: 'error', busy: true, message: error });
      } else if (abandoned) {
        const reason = interruption?.startsWith('The test exceeded') ? 'The test exceeded two minutes.' : 'The test was interrupted.';
        publish({ phase: 'error', busy: false, message: reason + ' Its model resources have now been released. Keep ORBIT open during the next test.' });
      } else if (error || !outcome) {
        publish({ phase: 'error', busy: false, message: error ?? 'The test did not finish.' });
      } else {
        publish({ phase: 'ready', busy: false, result: { ...outcome, totalMs: now() - started } });
      }
    }
  };
  return {
    getState: () => state,
    subscribe(listener: (state: GemmaTestState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start,
    cancel() {
      abandon?.('The test was interrupted when you left the screen or app. The native operation is still finishing; its model will be released before another test can start.');
    },
  };
}
