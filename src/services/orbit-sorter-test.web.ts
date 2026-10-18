import { createGemmaTester } from './gemma-test-runner';

export interface SorterModel { fileName: string; sizeBytes: number; lastModifiedMs: number }

export function listSorterModels(): SorterModel[] {
  throw new Error('Test the sorter in the installed ORBIT development app on your tablet. The browser cannot use this mobile runtime.');
}

export const sorterTester = createGemmaTester(() => {
  throw new Error('Test the sorter in the installed ORBIT development app on your tablet. The browser cannot use this mobile runtime.');
});
