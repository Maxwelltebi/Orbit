import { cleanProfile, createStorageQueue, type OrbitRepository } from '../storage/repository';
import { derivePin, equalVerifier } from './pin-hash';
import { validatePin } from './login-record';
import { loginDeadline } from './login-deadline';

type SecretStore = { read(): Promise<string | null>; write(value: string): Promise<void> };
const queues = new WeakMap<OrbitRepository, ReturnType<typeof createStorageQueue>>();
export function createLocalLogin(repo: OrbitRepository, secrets: SecretStore, random: (bytes: number) => Promise<string>,
  derive = derivePin, now = Date.now, timeoutMs = 30000) {
  // Retry/remount can create another service while a timed-out native call is
  // still pending. Keep its queue shared so no second setup can replace its key.
  let enqueue = queues.get(repo);
  if (!enqueue) { enqueue = createStorageQueue(); queues.set(repo, enqueue); }
  const queue = enqueue;
  async function pepper() {
    const saved = await secrets.read();
    if (!saved || !/^[0-9a-f]{64}$/.test(saved)) {
      throw new Error('The phone’s login key is unavailable. Your thoughts are still saved; they have not been reset.');
    }
    return saved;
  }
  return {
    status: () => loginDeadline(queue(async () => {
      const record = await repo.loadLogin();
      if (!record) return 'setup' as const;
      await pepper();
      return 'locked' as const;
    }), () => 'opening your saved login', timeoutMs),
    setup: (name: string, pin: string, confirm: string, report: (stage: string) => void = () => undefined) => {
      let stage = 'opening your saved login';
      const progress = (value: string) => { stage = value; report(value); };
      return loginDeadline(queue(async () => {
      validatePin(pin);
      if (pin !== confirm) throw new Error('The PINs do not match. Please try again.');
      const profile = cleanProfile({ name, about: '' });
      if (!profile.name) throw new Error('Enter your name.');
      if (await repo.loadLogin()) throw new Error('A local login already exists. Please log in.');
      progress('protecting your PIN');
      const salt = await random(16);
      const secret = await random(32);
      const verifier = await derive(pin, salt, secret, 2);
      // Secret first: a SQLite commit can never leave a credential without its key.
      // If SQL fails, the unused secret is harmless and a setup retry replaces it.
      progress('saving the phone’s secure key');
      await secrets.write(secret);
      progress('saving your login on this device');
      return repo.createLogin(profile.name, { version: 2, salt, verifier, attempts: 0, retryAt: 0 });
      }), () => stage, timeoutMs);
    },
    unlock: (name: string, pin: string, report: (stage: string) => void = () => undefined) => {
      let stage = 'opening your saved login';
      const progress = (value: string) => { stage = value; report(value); };
      return loginDeadline(queue(async () => {
      validatePin(pin);
      const record = await repo.loadLogin();
      if (!record) throw new Error('Set up your local login first.');
      if (record.retryAt > now()) throw new Error(`Please wait ${Math.ceil((record.retryAt - now()) / 1000)} seconds before trying again.`);
      progress('checking your PIN');
      const secret = await pepper();
      const actual = await derive(pin, record.salt, secret, record.version);
      const profile = (await repo.load()).profile;
      const normalize = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase();
      if (!equalVerifier(actual, record.verifier) || normalize(name) !== normalize(profile.name)) {
        const attempts = Math.min(20, record.attempts + 1);
        const delay = attempts < 5 ? 0 : Math.min(900000, 30000 * 2 ** Math.min(5, attempts - 5));
        await repo.updateLoginAttempts(attempts, now() + delay);
        throw new Error(delay ? `Name or PIN did not match. Please wait ${delay / 1000} seconds before trying again.` : 'Name or PIN did not match. Please try again.');
      }
      progress('opening your saved thoughts');
      if (record.version === 1) await repo.upgradeLogin({ ...record, version: 2, verifier: await derive(pin, record.salt, secret, 2), attempts: 0, retryAt: 0 });
      else await repo.updateLoginAttempts(0, 0);
      }), () => stage, timeoutMs);
    },
  };
}
export type LocalLogin = ReturnType<typeof createLocalLogin>;
