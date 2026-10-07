const assert = require('node:assert/strict');
const { randomBytes, pbkdf2Sync, createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./lib/load-ts.cjs');
const { connect } = require('./test-storage.cjs');
const { createSQLiteRepository } = load('src/storage/sqlite-repository.ts');
const { createLocalLogin } = load('src/security/local-login.ts');
const { derivePin, PIN_ITERATIONS } = load('src/security/pin-hash.ts');
const { organizeManually } = load('src/services/thought-organizer.ts');
const { validateLoginRecord } = load('src/security/login-record.ts');
const { loginDeadline } = load('src/security/login-deadline.ts');

async function main() {
  const folder = fs.mkdtempSync(path.resolve(__dirname, '../.expo/login-test-'));
  const filename = path.join(folder, 'test.db');
  let handle = connect(filename);
  let secret = null;
  let failSecret = false;
  const vault = { read: async () => secret, write: async (value) => { if (failSecret) throw new Error('Vault unavailable'); secret = value; } };
  const random = async (bytes) => randomBytes(bytes).toString('hex');
  let time = 100000;
  try {
    let repo = await createSQLiteRepository(handle.connection);
    const text = 'Existing thoughts stay.';
    await repo.saveThoughtDump(text, organizeManually(text, 'Testing'));
    await repo.saveProfile({ name: 'Existing', about: 'Preserve this' });
    let auth = createLocalLogin(repo, vault, random, derivePin, () => time);
    assert.equal(await auth.status(), 'setup');
    await assert.rejects(auth.setup('Alex', '123', '123'), /six-digit/);
    await assert.rejects(auth.setup('Alex', '612345', '612344'), /do not match/);
    await assert.rejects(auth.setup(' ', '612345', '612345'), /name/);
    failSecret = true;
    await assert.rejects(auth.setup('Alex', '612345', '612345'), /Vault unavailable/);
    assert.equal(await repo.loadLogin(), null);
    failSecret = false;
    handle.connection.failNext = (sql) => sql.startsWith('UPDATE profile');
    await assert.rejects(auth.setup('Alex', '612345', '612345'), /Simulated/);
    assert.equal(await repo.loadLogin(), null, 'Failed setup rolls back login and name together');
    assert.equal((await repo.load()).profile.name, 'Existing');
    const saved = await auth.setup('Alex', '612345', '612345');
    assert.equal(saved.profile.name, 'Alex');
    assert.equal(saved.profile.about, 'Preserve this');
    assert.equal(saved.thoughts[0].text, text);
    const record = await repo.loadLogin();
    assert(!Object.values(record).includes('612345'), 'No plaintext PIN in SQLite');
    assert(!JSON.stringify(record).includes(secret), 'Device pepper is absent from SQLite');
    assert.equal(record.version, 2);
    assert.equal(record.verifier, createHmac('sha256', Buffer.from(secret, 'hex')).update(`orbit.local-pin.v2:${record.salt}:612345`).digest('hex'));
    await assert.rejects(auth.setup('Other', '999999', '999999'), /already exists/);
    await auth.unlock(' alex ', '612345');
    for (let i = 0; i < 5; i++) await assert.rejects(auth.unlock('Alex', '999999'), /did not match/);
    assert.equal((await repo.loadLogin()).attempts, 5);
    assert.equal((await repo.loadLogin()).retryAt, time + 30000);
    await assert.rejects(auth.unlock('Alex', '612345'), /wait 30 seconds/);

    // Restart retains verifier and lockout; no remembered unlocked session is persisted.
    handle.raw.close();
    handle = connect(filename);
    repo = await createSQLiteRepository(handle.connection);
    auth = createLocalLogin(repo, vault, random, derivePin, () => time);
    assert.equal(await auth.status(), 'locked');
    await assert.rejects(auth.unlock('Alex', '612345'), /wait/);
    time += 30000;
    await auth.unlock('Alex', '612345');
    assert.equal((await repo.loadLogin()).attempts, 0);
    assert.equal((await repo.loadLogin()).retryAt, 0);
    await assert.rejects(auth.unlock('Wrong name', '612345'), /did not match/);
    assert.equal((await repo.loadLogin()).attempts, 1);
    handle.connection.failNext = (sql) => sql.startsWith('UPDATE local_login');
    await assert.rejects(auth.unlock('Alex', '612345'), /Simulated/, 'Cannot unlock if durable attempt reset fails');
    await auth.unlock('Alex', '612345');
    await repo.saveProfile({ name: 'Alex Lane', about: 'Changed profile' });
    await auth.unlock('Alex Lane', '612345');
    await assert.rejects(repo.saveProfile({ name: '', about: '' }), /Keep a name/);
    assert.equal((await repo.load()).profile.name, 'Alex Lane');
    const savedSecret = secret;
    secret = null;
    await assert.rejects(auth.status(), /login key is unavailable/);
    await assert.rejects(auth.unlock('Alex Lane', '612345'), /login key is unavailable/);
    assert.equal((await repo.load()).thoughts[0].text, text);
    secret = savedSecret;
    assert.throws(() => validateLoginRecord({ ...record, verifier: 'bad' }));
    assert.throws(() => validateLoginRecord({ ...record, retryAt: -1 }));
    const unrelatedSalt = await random(16);
    assert.notEqual(await derivePin('612345', unrelatedSalt, secret), record.verifier);
    assert.notEqual(await derivePin('612345', record.salt, await random(32)), record.verifier);
    // The old 600,000-round format remains readable, then upgrades after a correct PIN.
    const legacyHash = pbkdf2Sync(`612345:${secret}`, Buffer.from(record.salt, 'hex'), PIN_ITERATIONS, 32, 'sha256').toString('hex');
    handle.raw.prepare('UPDATE local_login SET version = 1, verifier = ? WHERE id = 1').run(legacyHash);
    await assert.rejects(auth.unlock('Alex Lane', '999999'), /did not match/);
    assert.equal((await repo.loadLogin()).version, 1, 'Wrong legacy PIN never upgrades the verifier');
    await auth.unlock('Alex Lane', '612345');
    assert.equal((await repo.loadLogin()).version, 2);
    await auth.unlock('Alex Lane', '612345');
    await assert.rejects(loginDeadline(new Promise(() => {}), () => 'testing a stalled native call', 10), /Login took too long.*stalled native call/);
    assert.equal(await loginDeadline(Promise.resolve('ready'), () => 'loading', 10), 'ready');
    // UI deadlines never release a pending native mutation's queue. A late setup
    // cannot be overtaken by another setup which replaces the device key.
    const second = connect(':memory:');
    try {
      const secondRepo = await createSQLiteRepository(second.connection);
      let release;
      let savedKey;
      let writes = 0;
      const slowVault = { read: async () => savedKey ?? null, write: (value) => new Promise((resolve) => {
        writes++; release = () => { savedKey = value; resolve(); };
      }) };
      const slow = createLocalLogin(secondRepo, slowVault, random, derivePin, () => time, 30);
      await assert.rejects(slow.setup('First', '612345', '612345'), /took too long/);
      const recreated = createLocalLogin(secondRepo, slowVault, random, derivePin, () => time, 30);
      const retry = recreated.setup('Second', '999999', '999999');
      assert.equal(writes, 1);
      release();
      await assert.rejects(retry, /already exists/);
      assert.equal(writes, 1);
      assert.equal((await secondRepo.load()).profile.name, 'First');
      await slow.unlock('First', '612345');
    } finally { second.raw.close(); }
    console.log('Local login checks passed: keyed verifier, Node crypto comparison, legacy upgrade, bounded waits, late-save serialization, atomic setup, key errors, persisted lockout/restart and journal preservation.');
  } finally {
    handle.raw.close();
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const target = filename + suffix;
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(folder);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
