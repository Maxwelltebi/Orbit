import { validateOrganization, type Organization } from '../services/thought-organizer';
import { appendThoughtDump } from '../state/thought-store';
import { cleanProfile, createStorageQueue, emptyOrbit, type OrbitRepository, type OrbitSnapshot, type Profile } from './repository';
import { validateLoginRecord, type LoginRecord } from '../security/login-record';

export const BROWSER_STORAGE_KEY = 'orbit-browser-preview-v1';
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>;

// A persistent browser preview. Android/iOS use SQLite through database.ts instead.
export function createBrowserRepository(storage: BrowserStorage): OrbitRepository {
  const enqueue = createStorageQueue();
  function readStored(): { orbit: OrbitSnapshot; login: LoginRecord | null } {
    const saved = storage.getItem(BROWSER_STORAGE_KEY);
    if (saved === null) return { orbit: emptyOrbit, login: null };
    const data = JSON.parse(saved);
    if (data.version !== 1 || !data.orbit || !Array.isArray(data.orbit.categories) || !Array.isArray(data.orbit.thoughts)
      || !Array.isArray(data.orbit.dumps) || typeof data.orbit.profile?.name !== 'string' || typeof data.orbit.profile?.about !== 'string') {
      throw new Error('Saved browser data could not be opened.');
    }
    return { orbit: data.orbit, login: data.login == null ? null : validateLoginRecord(data.login) };
  }
  function read() { return readStored().orbit; }
  function persist(snapshot: OrbitSnapshot, login = readStored().login) {
    // setItem is atomic; quota/access errors must propagate, never claim a successful save.
    storage.setItem(BROWSER_STORAGE_KEY, JSON.stringify({ version: 1, orbit: snapshot, login }));
    return snapshot;
  }
  return {
    storageKind: 'browser',
    load: () => enqueue(async () => read()),
    loadLogin: () => enqueue(async () => readStored().login),
    createLogin: (name, input) => enqueue(async () => {
      const current = readStored();
      if (current.login) throw new Error('A local login already exists. Please log in.');
      const profile = cleanProfile({ ...current.orbit.profile, name });
      if (!profile.name) throw new Error('Enter your name.');
      return persist({ ...current.orbit, profile }, validateLoginRecord(input));
    }),
    updateLoginAttempts: (attempts, retryAt) => enqueue(async () => {
      const current = readStored();
      if (!current.login) throw new Error('Set up your local login first.');
      persist(current.orbit, validateLoginRecord({ ...current.login, attempts, retryAt }));
    }),
    upgradeLogin: (input) => enqueue(async () => {
      const record = validateLoginRecord(input);
      const current = readStored();
      if (!current.login || current.login.version !== 1 || record.version !== 2 || record.salt !== current.login.salt) throw new Error('The saved login changed. Please try again.');
      persist(current.orbit, { ...record, attempts: 0, retryAt: 0 });
    }),
    saveThoughtDump: (text: string, input: Organization) => enqueue(async () => {
      if (!text.trim() || text.length > 12000) throw new Error('Please enter a thought of up to 12,000 characters.');
      const organization = validateOrganization(text, input);
      const current = read();
      const nextId = String(current.dumps.reduce((maximum, dump) => Math.max(maximum, Number(dump.id)), 0) + 1);
      const next = appendThoughtDump(current, { id: nextId, text, method: organization.method, createdAt: Date.now() }, organization);
      return persist({ ...next, profile: current.profile });
    }),
    saveProfile: (input: Profile) => enqueue(async () => {
      const current = readStored();
      const profile = cleanProfile(input);
      if (!profile.name && current.login) throw new Error('Keep a name for your local login.');
      return persist({ ...current.orbit, profile }, current.login);
    }),
  };
}
