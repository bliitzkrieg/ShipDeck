import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const targetDbVersion = 2;

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  dev_command TEXT NOT NULL,
  default_port INTEGER,
  last_active_session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (default_port IS NULL OR (default_port BETWEEN 1 AND 65535))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('codex','claude')),
  cli_session_name TEXT NOT NULL,
  runtime_mode TEXT NOT NULL DEFAULT 'full-access' CHECK(runtime_mode IN ('full-access','approval-required')),
  interaction_mode TEXT NOT NULL DEFAULT 'default' CHECK(interaction_mode IN ('default','plan')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_web_targets (
  session_id TEXT PRIMARY KEY,
  port INTEGER NOT NULL CHECK(port BETWEEN 1 AND 65535),
  path TEXT NOT NULL DEFAULT '/',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS terminals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('server','shell')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id_created_at ON messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminals_project_id ON terminals(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
`;

let db: Database.Database | null = null;

function tableExists(instance: Database.Database, tableName: string): boolean {
  const row = instance
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as Record<string, unknown> | undefined;
  return Boolean(row);
}

function columnExists(instance: Database.Database, tableName: string, columnName: string): boolean {
  const rows = instance.prepare(`PRAGMA table_info(${tableName})`).all() as Array<Record<string, unknown>>;
  return rows.some((row) => String(row.name) === columnName);
}

function migrateToV1(instance: Database.Database): void {
  instance.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    instance.exec("PRAGMA foreign_keys = OFF");

    if (!tableExists(instance, "projects")) {
      instance.exec(schemaSql);
      instance.exec(`PRAGMA user_version = ${targetDbVersion}`);
      instance.exec("PRAGMA foreign_keys = ON");
      instance.exec("COMMIT");
      return;
    }

    if (!columnExists(instance, "projects", "last_active_session_id")) {
      instance.exec("ALTER TABLE projects ADD COLUMN last_active_session_id TEXT");
      if (columnExists(instance, "projects", "last_active_conversation_id")) {
        instance.exec("UPDATE projects SET last_active_session_id = last_active_conversation_id WHERE last_active_session_id IS NULL");
      }
    }

    instance.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('codex','claude')),
        cli_session_name TEXT NOT NULL,
        runtime_mode TEXT NOT NULL DEFAULT 'full-access' CHECK(runtime_mode IN ('full-access','approval-required')),
        interaction_mode TEXT NOT NULL DEFAULT 'default' CHECK(interaction_mode IN ('default','plan')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    if (!columnExists(instance, "sessions", "runtime_mode")) {
      instance.exec("ALTER TABLE sessions ADD COLUMN runtime_mode TEXT NOT NULL DEFAULT 'full-access'");
    }

    if (!columnExists(instance, "sessions", "interaction_mode")) {
      instance.exec("ALTER TABLE sessions ADD COLUMN interaction_mode TEXT NOT NULL DEFAULT 'default'");
    }

    if (tableExists(instance, "conversations")) {
      instance.exec(`
        INSERT OR IGNORE INTO sessions (
          id,
          project_id,
          title,
          provider,
          cli_session_name,
          runtime_mode,
          interaction_mode,
          created_at,
          updated_at
        )
        SELECT
          id,
          project_id,
          title,
          COALESCE(provider, 'codex'),
          ('legacy-' || COALESCE(provider, 'codex') || '-' || id),
          'full-access',
          'default',
          created_at,
          updated_at
        FROM conversations;
      `);
    }

    instance.exec(`
      CREATE TABLE IF NOT EXISTS messages_new (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    if (tableExists(instance, "messages")) {
      if (columnExists(instance, "messages", "conversation_id")) {
        instance.exec(`
          INSERT OR IGNORE INTO messages_new (id, session_id, role, content, created_at)
          SELECT id, conversation_id, role, content, created_at
          FROM messages;
        `);
      } else if (columnExists(instance, "messages", "session_id")) {
        instance.exec(`
          INSERT OR IGNORE INTO messages_new (id, session_id, role, content, created_at)
          SELECT id, session_id, role, content, created_at
          FROM messages;
        `);
      }
      instance.exec("DROP TABLE messages");
    }
    instance.exec("ALTER TABLE messages_new RENAME TO messages");

    instance.exec(`
      CREATE TABLE IF NOT EXISTS session_web_targets (
        session_id TEXT PRIMARY KEY,
        port INTEGER NOT NULL CHECK(port BETWEEN 1 AND 65535),
        path TEXT NOT NULL DEFAULT '/',
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    if (tableExists(instance, "conversation_web_targets")) {
      instance.exec(`
        INSERT OR IGNORE INTO session_web_targets (session_id, port, path, updated_at)
        SELECT conversation_id, port, path, updated_at
        FROM conversation_web_targets;
      `);
    }

    instance.exec(`
      CREATE TABLE IF NOT EXISTS terminals (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('server','shell')),
        created_at INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    instance.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    instance.exec("CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id)");
    instance.exec("CREATE INDEX IF NOT EXISTS idx_messages_session_id_created_at ON messages(session_id, created_at DESC)");
    instance.exec("CREATE INDEX IF NOT EXISTS idx_terminals_project_id ON terminals(project_id)");
    instance.exec("CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC)");

    instance.exec(`PRAGMA user_version = ${targetDbVersion}`);
    instance.exec("PRAGMA foreign_keys = ON");
    instance.exec("COMMIT");
  } catch (error) {
    instance.exec("ROLLBACK");
    instance.exec("PRAGMA foreign_keys = ON");
    throw error;
  }
}

export function initDb(): Database.Database {
  if (db) {
    return db;
  }

  const userData = app.getPath("userData");
  fs.mkdirSync(userData, { recursive: true });
  const dbPath = path.join(userData, "cockpit.sqlite");
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.exec("PRAGMA foreign_keys = ON");

  const version = Number(instance.pragma("user_version", { simple: true }) ?? 0);
  if (version < targetDbVersion) {
    migrateToV1(instance);
  } else {
    instance.exec(schemaSql);
  }

  db = instance;
  return instance;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized");
  }

  return db;
}
