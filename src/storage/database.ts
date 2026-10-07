import { openDatabaseAsync } from 'expo-sqlite';

import type { OrbitRepository } from './repository';
import { createSQLiteRepository } from './sqlite-repository';

let opening: Promise<OrbitRepository> | null = null;

export function openOrbitRepository(): Promise<OrbitRepository> {
  if (!opening) opening = (async () => {
    const db = await openDatabaseAsync('orbit.db');
    try {
      return await createSQLiteRepository(db);
    } catch (error) {
      await db.closeAsync().catch(() => undefined);
      throw error;
    }
  })().catch((error) => { opening = null; throw error; });
  return opening;
}
