import { createGemmaTester } from './gemma-test-runner';
export const gemmaTester = createGemmaTester(() => {
  throw new Error('Test Gemma in the installed ORBIT development app on your tablet. The browser cannot use this mobile runtime.');
});
