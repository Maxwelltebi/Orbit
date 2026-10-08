export type RuntimeCheck =
  | { status: 'ready'; availableMemoryBytes: number; residentBytes: number; isLowMemory: boolean; cachedModelCount: number; checkedAt: number }
  | { status: 'unavailable' | 'error'; message: string };
