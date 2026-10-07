export const DATABASE_VERSION = 3;

// Static schema only. All user-provided values are passed as bound SQL parameters.
export const INITIAL_SCHEMA = `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 48),
    normalized_key TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order >= 0)
  );
  CREATE TABLE thought_dumps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    method TEXT NOT NULL CHECK (method IN ('preview', 'model', 'manual'))
  );
  CREATE TABLE thoughts (
    id TEXT PRIMARY KEY NOT NULL,
    source_id INTEGER NOT NULL REFERENCES thought_dumps(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    part_index INTEGER NOT NULL CHECK (part_index >= 0),
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
    end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    UNIQUE (source_id, part_index)
  );
  CREATE INDEX thoughts_by_category ON thoughts(category_id, created_at DESC);
  CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '' CHECK (length(name) <= 80),
    about TEXT NOT NULL DEFAULT '' CHECK (length(about) <= 500)
  );
  CREATE TABLE app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dominant_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL
  );
  INSERT INTO profile (id, name, about) VALUES (1, '', '');
  INSERT INTO app_state (id, dominant_category_id) VALUES (1, NULL);
  PRAGMA user_version = 1;
`;

// Widen the verifier version constraint while preserving every saved credential.
export const KEYED_LOGIN_MIGRATION = `
  ALTER TABLE local_login RENAME TO local_login_legacy;
  CREATE TABLE local_login (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL CHECK (version IN (1, 2)),
    salt TEXT NOT NULL CHECK (length(salt) = 32),
    verifier TEXT NOT NULL CHECK (length(verifier) = 64),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
    retry_at INTEGER NOT NULL DEFAULT 0 CHECK (retry_at >= 0)
  );
  INSERT INTO local_login SELECT * FROM local_login_legacy;
  DROP TABLE local_login_legacy;
  PRAGMA user_version = 3;
`;

// Version 1 journals remain intact; credentials are created only after local setup.
export const LOGIN_MIGRATION = `
  CREATE TABLE local_login (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL CHECK (version = 1),
    salt TEXT NOT NULL CHECK (length(salt) = 32),
    verifier TEXT NOT NULL CHECK (length(verifier) = 64),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
    retry_at INTEGER NOT NULL DEFAULT 0 CHECK (retry_at >= 0)
  );
  PRAGMA user_version = 2;
`;
