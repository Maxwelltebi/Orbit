import { createBrowserRepository } from './browser-repository';
import type { OrbitRepository } from './repository';

let repository: OrbitRepository | null = null;

export async function openOrbitRepository(): Promise<OrbitRepository> {
  if (typeof window === 'undefined') throw new Error('Browser storage is not available during server rendering.');
  if (!repository) repository = createBrowserRepository(window.localStorage);
  return repository;
}
