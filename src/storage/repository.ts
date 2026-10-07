import type { Organization } from '../services/thought-organizer';
import { emptyThoughtStore, type ThoughtStore } from '../state/thought-store';
import type { LoginRecord } from '../security/login-record';

export type Profile = { name: string; about: string };
export type OrbitSnapshot = ThoughtStore & { profile: Profile };
export const emptyOrbit: OrbitSnapshot = { ...emptyThoughtStore, profile: { name: '', about: '' } };
export interface OrbitRepository {
  readonly storageKind: 'sqlite' | 'browser';
  load(): Promise<OrbitSnapshot>;
  saveThoughtDump(text: string, organization: Organization): Promise<OrbitSnapshot>;
  saveProfile(profile: Profile): Promise<OrbitSnapshot>;
  loadLogin(): Promise<LoginRecord | null>;
  createLogin(name: string, record: LoginRecord): Promise<OrbitSnapshot>;
  updateLoginAttempts(attempts: number, retryAt: number): Promise<void>;
  upgradeLogin(record: LoginRecord): Promise<void>;
}

export function cleanProfile(profile: Profile): Profile {
  const name = profile.name.trim();
  const about = profile.about.trim();
  if (name.length > 80 || about.length > 500) throw new Error('Please shorten your profile before saving.');
  return { name, about };
}

// Keep every read/write on our private connection in order. A rejection does not block retry.
export function createStorageQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.then(work);
    tail = next.catch(() => undefined);
    return next;
  };
}
