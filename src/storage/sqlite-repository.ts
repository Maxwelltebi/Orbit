import { categoryKey, validateOrganization, type Category, type Organization } from '../services/thought-organizer';
import { dominantCategory } from '../services/bubble-layout';
import { appendThoughtDump, type Thought, type ThoughtDump } from '../state/thought-store';
import { cleanProfile, createStorageQueue, type OrbitRepository, type OrbitSnapshot, type Profile } from './repository';
import { DATABASE_VERSION, INITIAL_SCHEMA, LOGIN_MIGRATION, KEYED_LOGIN_MIGRATION } from './schema';
import { validateLoginRecord, type LoginRecord } from '../security/login-record';

type SqlValue = string | number | null;
export interface SqlConnection {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...values: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string, ...values: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...values: SqlValue[]): Promise<T[]>;
  withTransactionAsync(work: () => Promise<void>): Promise<void>;
}

async function readOrbit(db: SqlConnection): Promise<OrbitSnapshot> {
  const categories = await db.getAllAsync<Category>('SELECT id, label FROM categories ORDER BY sort_order');
  const thoughts = await db.getAllAsync<Thought>(`SELECT id, text, category_id AS categoryId,
    CAST(source_id AS TEXT) AS sourceId, start_offset AS start, end_offset AS end, created_at AS createdAt
    FROM thoughts ORDER BY source_id DESC, part_index ASC`);
  const dumps = await db.getAllAsync<ThoughtDump>(`SELECT CAST(id AS TEXT) AS id, text, created_at AS createdAt, method
    FROM thought_dumps ORDER BY thought_dumps.id DESC`);
  const profile = await db.getFirstAsync<Profile>('SELECT name, about FROM profile WHERE id = 1');
  const state = await db.getFirstAsync<{ dominantCategoryId: string | null }>('SELECT dominant_category_id AS dominantCategoryId FROM app_state WHERE id = 1');
  if (!profile || !state) throw new Error('Saved Orbit data is incomplete.');
  const counts = new Map<string, number>();
  for (const thought of thoughts) counts.set(thought.categoryId, (counts.get(thought.categoryId) ?? 0) + 1);
  return { categories, thoughts, dumps, profile, dominantCategoryId: dominantCategory(categories, counts, state.dominantCategoryId) };
}

export async function createSQLiteRepository(db: SqlConnection): Promise<OrbitRepository> {
  // PRAGMAs apply to this connection, before any transaction begins.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
  await db.withTransactionAsync(async () => {
    const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    if (version > DATABASE_VERSION) throw new Error('This Orbit database needs a newer app version.');
    if (version === 0) await db.execAsync(INITIAL_SCHEMA);
    if (version < 2) await db.execAsync(LOGIN_MIGRATION);
    if (version < 3) await db.execAsync(KEYED_LOGIN_MIGRATION);
  });
  const enqueue = createStorageQueue();

  async function transaction<T>(work: () => Promise<T>): Promise<T> {
    let result!: T;
    await db.withTransactionAsync(async () => { result = await work(); });
    return result;
  }

  async function readLogin() {
    const record = await db.getFirstAsync<LoginRecord>('SELECT version, salt, verifier, attempts, retry_at AS retryAt FROM local_login WHERE id = 1');
    return record ? validateLoginRecord(record) : null;
  }

  // The connection stays private; every public operation uses the same queue.
  // No unrelated query can enter an active withTransactionAsync transaction.
  return {
    storageKind: 'sqlite',
    load: () => enqueue(() => transaction(() => readOrbit(db))),
    loadLogin: () => enqueue(readLogin),
    createLogin: (name, input) => enqueue(() => transaction(async () => {
      const record = validateLoginRecord(input);
      const profile = cleanProfile({ name, about: '' });
      if (!profile.name) throw new Error('Enter your name.');
      if (await readLogin()) throw new Error('A local login already exists. Please log in.');
      await db.runAsync('INSERT INTO local_login (id, version, salt, verifier, attempts, retry_at) VALUES (1, ?, ?, ?, ?, ?)',
        record.version, record.salt, record.verifier, record.attempts, record.retryAt);
      await db.runAsync('UPDATE profile SET name = ? WHERE id = 1', profile.name);
      return readOrbit(db);
    })),
    updateLoginAttempts: (attempts, retryAt) => enqueue(() => transaction(async () => {
      const current = await readLogin();
      if (!current) throw new Error('Set up your local login first.');
      validateLoginRecord({ ...current, attempts, retryAt });
      await db.runAsync('UPDATE local_login SET attempts = ?, retry_at = ? WHERE id = 1', attempts, retryAt);
    })),
    upgradeLogin: (input) => enqueue(() => transaction(async () => {
      const record = validateLoginRecord(input);
      const current = await readLogin();
      if (!current || current.version !== 1 || record.version !== 2 || record.salt !== current.salt) throw new Error('The saved login changed. Please try again.');
      await db.runAsync('UPDATE local_login SET version = 2, verifier = ?, attempts = 0, retry_at = 0 WHERE id = 1', record.verifier);
    })),
    saveThoughtDump: (text: string, input: Organization) => enqueue(async () => {
      if (!text.trim() || text.length > 12000) throw new Error('Please enter a thought of up to 12,000 characters.');
      const organization = validateOrganization(text, input);
      return transaction(async () => {
        const current = await readOrbit(db);
        const createdAt = Date.now();
        const inserted = await db.runAsync('INSERT INTO thought_dumps (text, created_at, method) VALUES (?, ?, ?)', text, createdAt, organization.method);
        const dump = { id: String(inserted.lastInsertRowId), text, createdAt, method: organization.method };
        const next = appendThoughtDump(current, dump, organization);
        const known = new Set(current.categories.map((category) => category.id));
        for (const [index, category] of next.categories.entries()) {
          if (!known.has(category.id)) await db.runAsync('INSERT INTO categories (id, label, normalized_key, sort_order) VALUES (?, ?, ?, ?)',
            category.id, category.label, categoryKey(category.label), index);
        }
        const parts = next.thoughts.filter((thought) => thought.sourceId === dump.id);
        for (const [index, thought] of parts.entries()) {
          await db.runAsync(`INSERT INTO thoughts (id, source_id, category_id, part_index, text, start_offset, end_offset, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, thought.id, inserted.lastInsertRowId, thought.categoryId, index,
          thought.text, thought.start, thought.end, thought.createdAt);
        }
        await db.runAsync('UPDATE app_state SET dominant_category_id = ? WHERE id = 1', next.dominantCategoryId);
        return { ...next, profile: current.profile };
      });
    }),
    saveProfile: (input: Profile) => enqueue(() => transaction(async () => {
      const profile = cleanProfile(input);
      if (!profile.name && await readLogin()) throw new Error('Keep a name for your local login.');
      await db.runAsync('UPDATE profile SET name = ?, about = ? WHERE id = 1', profile.name, profile.about);
      return readOrbit(db);
    })),
  };
}
