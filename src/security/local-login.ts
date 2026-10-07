import { cleanProfile, createStorageQueue, type OrbitRepository } from '../storage/repository';
import { derivePin, equalVerifier } from './pin-hash';
import { validatePin } from './login-record';

type SecretStore = { read(): Promise<string | null>; write(value: string): Promise<void> };
export function createLocalLogin(repo: OrbitRepository, secrets: SecretStore, random: (bytes: number) => Promise<string>,
  derive = derivePin, now = Date.now) {
  const enqueue = createStorageQueue();
  async function pepper() {
    const saved = await secrets.read();
    if (!saved || !/^[0-9a-f]{64}$/.test(saved)) {
      throw new Error('The phone’s login key is unavailable. Your thoughts are still saved; they have not been reset.');
    }
    return saved;
  }
  return {
    status: () => enqueue(async () => {
      const record = await repo.loadLogin();
      if (!record) return 'setup' as const;
      await pepper();
      return 'locked' as const;
    }),
    setup: (name: string, pin: string, confirm: string) => enqueue(async () => {
      validatePin(pin);
      if (pin !== confirm) throw new Error('The PINs do not match. Please try again.');
      const profile = cleanProfile({ name, about: '' });
      if (!profile.name) throw new Error('Enter your name.');
      if (await repo.loadLogin()) throw new Error('A local login already exists. Please log in.');
      const salt = await random(16);
      const secret = await random(32);
      const verifier = await derive(pin, salt, secret);
      // Secret first: a SQLite commit can never leave a credential without its key.
      // If SQL fails, the unused secret is harmless and a setup retry replaces it.
      await secrets.write(secret);
      return repo.createLogin(profile.name, { version: 1, salt, verifier, attempts: 0, retryAt: 0 });
    }),
    unlock: (name: string, pin: string) => enqueue(async () => {
      validatePin(pin);
      const record = await repo.loadLogin();
      if (!record) throw new Error('Set up your local login first.');
      if (record.retryAt > now()) throw new Error(`Please wait ${Math.ceil((record.retryAt - now()) / 1000)} seconds before trying again.`);
      const actual = await derive(pin, record.salt, await pepper());
      const profile = (await repo.load()).profile;
      const normalize = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase();
      if (!equalVerifier(actual, record.verifier) || normalize(name) !== normalize(profile.name)) {
        const attempts = Math.min(20, record.attempts + 1);
        const delay = attempts < 5 ? 0 : Math.min(900000, 30000 * 2 ** Math.min(5, attempts - 5));
        await repo.updateLoginAttempts(attempts, now() + delay);
        throw new Error(delay ? `Name or PIN did not match. Please wait ${delay / 1000} seconds before trying again.` : 'Name or PIN did not match. Please try again.');
      }
      await repo.updateLoginAttempts(0, 0);
    }),
  };
}
export type LocalLogin = ReturnType<typeof createLocalLogin>;
