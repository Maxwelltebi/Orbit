// Bound what the UI waits for, without freeing the underlying mutation queue.
// A late native save may commit; retry must re-read that record, never overwrite it.
export function loginDeadline<T>(work: Promise<T>, stage: () => string, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Login took too long while ${stage()}. Close and reopen ORBIT, then try again. Your saved thoughts have not been deleted.`)), milliseconds);
    work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
