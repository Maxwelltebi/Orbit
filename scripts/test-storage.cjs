const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const load = require('./lib/load-ts.cjs');
const { createSQLiteRepository } = load('src/storage/sqlite-repository.ts');
const { createBrowserRepository } = load('src/storage/browser-repository.ts');
const { INITIAL_SCHEMA, LOGIN_MIGRATION } = load('src/storage/schema.ts');
const { organizeManually, organizePreview } = load('src/services/thought-organizer.ts');

// Exercise actual SQLite transactions through the same interface Expo provides.
function connect(filename) {
  const raw = new DatabaseSync(filename);
  const connection = {
    failNext: null,
    execAsync: async (sql) => { raw.exec(sql); },
    runAsync: async (sql, ...values) => {
      if (connection.failNext?.(sql)) {
        connection.failNext = null;
        throw new Error('Simulated storage failure');
      }
      const result = raw.prepare(sql).run(...values);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    getFirstAsync: async (sql, ...values) => {
      const row = raw.prepare(sql).get(...values);
      return row ? { ...row } : null;
    },
    getAllAsync: async (sql, ...values) => raw.prepare(sql).all(...values).map((row) => ({ ...row })),
    withTransactionAsync: async (work) => {
      raw.exec('BEGIN');
      try { await work(); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return { raw, connection };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

async function main() {
  const legacy = connect(':memory:');
  try {
    legacy.raw.exec(INITIAL_SCHEMA);
    legacy.raw.exec(`UPDATE profile SET name = 'Existing profile', about = 'Keep me' WHERE id = 1;
      INSERT INTO categories VALUES ('category:family', 'Family', 'family', 0);
      INSERT INTO thought_dumps VALUES (1, 'My family.', 1, 'manual');
      INSERT INTO thoughts VALUES ('1:0', 1, 'category:family', 0, 'My family.', 0, 10, 1);
      UPDATE app_state SET dominant_category_id = 'category:family' WHERE id = 1;`);
    const migrated = await createSQLiteRepository(legacy.connection);
    const existing = await migrated.load();
    assert.deepEqual(existing.profile, { name: 'Existing profile', about: 'Keep me' });
    assert.equal(existing.thoughts[0].text, 'My family.');
    assert.equal(existing.dominantCategoryId, 'category:family');
    assert.equal(await migrated.loadLogin(), null);
    assert.equal(legacy.raw.prepare('PRAGMA user_version').get().user_version, 3);
  } finally { legacy.raw.close(); }
  const versionTwo = connect(':memory:');
  try {
    versionTwo.raw.exec(INITIAL_SCHEMA);
    versionTwo.raw.exec(LOGIN_MIGRATION);
    const oldLogin = { version: 1, salt: 'ab'.repeat(16), verifier: 'cd'.repeat(32), attempts: 5, retryAt: 123456 };
    versionTwo.raw.prepare('INSERT INTO local_login VALUES (1, ?, ?, ?, ?, ?)').run(
      oldLogin.version, oldLogin.salt, oldLogin.verifier, oldLogin.attempts, oldLogin.retryAt);
    const originalExec = versionTwo.connection.execAsync;
    versionTwo.connection.execAsync = async (sql) => {
      await originalExec(sql);
      if (sql.includes('RENAME TO local_login_legacy')) throw new Error('Interrupted migration');
    };
    await assert.rejects(createSQLiteRepository(versionTwo.connection), /Interrupted migration/);
    assert.equal(versionTwo.raw.prepare('PRAGMA user_version').get().user_version, 2);
    assert.equal(versionTwo.raw.prepare('SELECT verifier FROM local_login').get().verifier, oldLogin.verifier);
    versionTwo.connection.execAsync = originalExec;
    const migrated = await createSQLiteRepository(versionTwo.connection);
    assert.deepEqual(await migrated.loadLogin(), oldLogin, 'Version 2 migration preserves old verifier and cooldown');
    assert.equal(versionTwo.raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { versionTwo.raw.close(); }
  const scratch = path.resolve(__dirname, '../.expo');
  fs.mkdirSync(scratch, { recursive: true });
  const folder = fs.mkdtempSync(path.join(scratch, 'storage-test-'));
  const filename = path.join(folder, 'test.db');
  let handle;
  try {
    handle = connect(filename);
    let repo = await createSQLiteRepository(handle.connection);
    assert.equal(handle.raw.prepare('PRAGMA user_version').get().user_version, 3);
    assert.equal(handle.raw.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(handle.raw.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.deepEqual(plain(await repo.load()).profile, { name: '', about: '' });
    const add = (category, text = 'A thought.') => repo.saveThoughtDump(text, organizeManually(text, category));
    await add('What if?');
    await add('Family');
    let saved = await add('Family');
    assert.equal(saved.dominantCategoryId, 'category:family');
    saved = await add('What if?');
    assert.equal(saved.dominantCategoryId, 'category:family', 'The newer leader keeps its centre on a tie');

    const text = "My mother's visit matters.\nMy exams are tomorrow! 🎸 I practise guitar.";
    saved = await repo.saveThoughtDump(text, await organizePreview(text, saved.categories));
    const dump = saved.dumps[0];
    assert.equal(dump.text, text);
    const segments = saved.thoughts.filter((thought) => thought.sourceId === dump.id);
    assert(segments.length > 1);
    for (const segment of segments) assert.equal(segment.text, text.slice(segment.start, segment.end));
    const profile = { name: "O'Brien 🎸", about: "'); DROP TABLE thoughts; --" };
    saved = await repo.saveProfile(profile);
    assert.deepEqual(saved.profile, profile, 'Profile text is bound literally');

    // Failure after both dump and category inserts must roll back every table.
    const beforeFailure = plain(saved);
    handle.connection.failNext = (sql) => sql.startsWith('UPDATE app_state');
    await assert.rejects(add('New failure category'), /Simulated/);
    assert.deepEqual(plain(await repo.load()), beforeFailure);
    await add('New failure category'); // Queue remains usable after rejection.
    const beforeProfile = plain(await repo.load());
    handle.connection.failNext = (sql) => sql.startsWith('UPDATE profile');
    await assert.rejects(repo.saveProfile({ name: 'Lost update', about: '' }), /Simulated/);
    assert.deepEqual(plain(await repo.load()), beforeProfile);
    await assert.rejects(repo.saveThoughtDump('Hello', { method: 'model', parts: [] }));
    assert.deepEqual(plain(await repo.load()), beforeProfile);
    assert.throws(() => handle.raw.prepare(`INSERT INTO thoughts
      (id,source_id,category_id,part_index,text,start_offset,end_offset,created_at)
      VALUES ('invalid',999,'missing',0,'test',0,4,1)`).run(), /FOREIGN KEY/);

    await Promise.all(Array.from({ length: 12 }, (_, i) => add('Creative Space', `Concurrent thought ${i}.`)));
    saved = await repo.load();
    assert.equal(saved.categories.filter((category) => category.label === 'Creative Space').length, 1);
    assert.equal(saved.thoughts.filter((thought) => thought.categoryId === 'category:creative space').length, 12);
    assert.deepEqual(saved.dumps.map((entry) => Number(entry.id)),
      saved.dumps.map((entry) => Number(entry.id)).sort((a, b) => b - a));

    // Persist a tie with an older category; deriving the leader by insertion order would fail.
    const familyCount = saved.thoughts.filter((thought) => thought.categoryId === 'category:family').length;
    for (let i = familyCount; i < 13; i++) await add('Family');
    saved = await add('Creative Space');
    assert.equal(saved.dominantCategoryId, 'category:family');
    const beforeReopen = plain(saved);
    handle.raw.close();
    handle = connect(filename);
    repo = await createSQLiteRepository(handle.connection);
    assert.deepEqual(plain(await repo.load()), beforeReopen, 'All saved data survives a real file close/reopen');
    await createSQLiteRepository(handle.connection); // Migration is idempotent.
    assert.deepEqual(plain(await repo.load()), beforeReopen);
    saved = await add('Family');
    assert(Number(saved.dumps[0].id) > Number(beforeReopen.dumps[0].id));
    assert.equal(new Set(saved.thoughts.map((thought) => thought.id)).size, saved.thoughts.length);

    handle.raw.exec('PRAGMA user_version = 4');
    await assert.rejects(createSQLiteRepository(handle.connection), /newer app version/);
    assert.equal(handle.raw.prepare('SELECT count(*) AS total FROM thoughts').get().total, saved.thoughts.length);
    assert.equal(handle.raw.prepare('PRAGMA user_version').get().user_version, 4);

    // Browser preview has separate persistent storage and propagates quota/corruption errors.
    let value = null;
    let fail = false;
    const storage = { getItem: () => value, setItem: (_, next) => { if (fail) throw new Error('Quota full'); value = next; } };
    let browser = createBrowserRepository(storage);
    const browserText = 'A browser-only test.';
    await browser.saveThoughtDump(browserText, organizeManually(browserText, 'Testing'));
    const browserSaved = await browser.saveProfile(profile);
    browser = createBrowserRepository(storage);
    assert.deepEqual(await browser.load(), browserSaved);
    fail = true;
    await assert.rejects(browser.saveProfile({ name: 'Unsaved', about: '' }), /Quota/);
    assert.deepEqual(await browser.load(), browserSaved);
    fail = false;
    await browser.saveProfile({ name: 'Retry works', about: '' });
    const fixtureLogin = { version: 1, salt: 'ab'.repeat(16), verifier: 'cd'.repeat(32), attempts: 0, retryAt: 0 };
    await browser.createLogin('Preview name', fixtureLogin);
    await browser.saveThoughtDump(browserText, organizeManually(browserText, 'Testing'));
    await browser.saveProfile({ name: 'Updated preview name', about: 'Preserved login' });
    await browser.updateLoginAttempts(5, 123456);
    browser = createBrowserRepository(storage);
    assert.deepEqual(await browser.loadLogin(), { ...fixtureLogin, attempts: 5, retryAt: 123456 });
    assert.equal((await browser.load()).thoughts.length, 2);
    await assert.rejects(browser.saveProfile({ name: '', about: '' }), /Keep a name/);
    await assert.rejects(browser.createLogin('Another', fixtureLogin), /already exists/);
    fail = true;
    await assert.rejects(browser.updateLoginAttempts(0, 0), /Quota/);
    assert.equal((await browser.loadLogin()).attempts, 5);
    fail = false;
    value = '{broken';
    await assert.rejects(browser.load());
    console.log('Storage checks passed: SQLite reopen, atomic rollback/retry, foreign keys, bound text, concurrent saves, numeric ordering, durable IDs, profile, tied centre and browser persistence.');
  } finally {
    handle?.raw.close();
    // Delete only the exact files created by this test, without recursive deletion.
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const target = filename + suffix;
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(folder);
  }
}
module.exports = { connect };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
