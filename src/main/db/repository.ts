import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  ActivatedContext,
  AppPreferences,
  Message,
  MessagePage,
  Project,
  Session,
  SessionProvider,
  SessionWebTarget,
  Terminal,
  TerminalKind
} from "../../shared/types";
import { makeId, nowTs } from "../../shared/utils";

const defaultSessionProviderKey = "default_session_provider";

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    devCommand: String(row.dev_command),
    defaultPort: row.default_port === null ? null : Number(row.default_port),
    lastActiveSessionId: row.last_active_session_id === null ? null : String(row.last_active_session_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapSession(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    provider: String(row.provider) as SessionProvider,
    cliSessionName: String(row.cli_session_name),
    runtimeMode: (String(row.runtime_mode ?? "full-access") as Session["runtimeMode"]),
    interactionMode: (String(row.interaction_mode ?? "default") as Session["interactionMode"]),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as Message["role"],
    content: String(row.content),
    createdAt: Number(row.created_at)
  };
}

function mapWebTarget(row: Record<string, unknown> | undefined): SessionWebTarget | null {
  if (!row) {
    return null;
  }

  return {
    sessionId: String(row.session_id),
    port: Number(row.port),
    path: String(row.path),
    updatedAt: Number(row.updated_at)
  };
}

export class Repository {
  constructor(private readonly db: BetterSqliteDatabase) {}

  listProjects(): Project[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as Record<string, unknown>[];
    return rows.map(mapProject);
  }

  createProject(input: { name: string; rootPath: string; devCommand: string; defaultPort?: number | null }): Project {
    const ts = nowTs();
    const id = makeId("prj");
    this.db
      .prepare(
        `INSERT INTO projects (id, name, root_path, dev_command, default_port, last_active_session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .run(id, input.name, input.rootPath, input.devCommand, input.defaultPort ?? null, ts, ts);
    return this.getProjectById(id);
  }

  updateProject(input: { projectId: string; name?: string; rootPath?: string; devCommand?: string; defaultPort?: number | null }): Project {
    const current = this.getProjectById(input.projectId);
    const ts = nowTs();
    this.db
      .prepare(
        `UPDATE projects
         SET name = ?, root_path = ?, dev_command = ?, default_port = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.name ?? current.name,
        input.rootPath ?? current.rootPath,
        input.devCommand ?? current.devCommand,
        input.defaultPort === undefined ? current.defaultPort : input.defaultPort,
        ts,
        input.projectId
      );
    return this.getProjectById(input.projectId);
  }

  getProjectById(projectId: string): Project {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return mapProject(row);
  }

  deleteProject(projectId: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  }

  clearProjectLastActiveSession(projectId: string): void {
    this.db
      .prepare("UPDATE projects SET last_active_session_id = NULL, updated_at = ? WHERE id = ?")
      .run(nowTs(), projectId);
  }

  listSessions(projectId: string): Session[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId) as Record<string, unknown>[];
    return rows.map(mapSession);
  }

  createSession(input: {
    projectId: string;
    title?: string;
    provider: SessionProvider;
    cliSessionName: string;
    runtimeMode?: Session["runtimeMode"];
    interactionMode?: Session["interactionMode"];
  }): Session {
    this.getProjectById(input.projectId);
    const ts = nowTs();
    const id = makeId("ses");
    const runtimeMode = input.runtimeMode ?? "full-access";
    const interactionMode = input.interactionMode ?? "default";
    this.db
      .prepare(
        `INSERT INTO sessions (
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.projectId,
        input.title ?? "New session",
        input.provider,
        input.cliSessionName,
        runtimeMode,
        interactionMode,
        ts,
        ts
      );
    return this.getSessionById(id);
  }

  renameSession(input: { sessionId: string; title: string }): Session {
    const ts = nowTs();
    this.db
      .prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?")
      .run(input.title, ts, input.sessionId);
    return this.getSessionById(input.sessionId);
  }

  updateSessionCliSessionName(input: { sessionId: string; cliSessionName: string }): Session {
    const ts = nowTs();
    this.db
      .prepare("UPDATE sessions SET cli_session_name = ?, updated_at = ? WHERE id = ?")
      .run(input.cliSessionName, ts, input.sessionId);
    return this.getSessionById(input.sessionId);
  }

  updateSessionModes(input: {
    sessionId: string;
    runtimeMode?: Session["runtimeMode"];
    interactionMode?: Session["interactionMode"];
  }): Session {
    const current = this.getSessionById(input.sessionId);
    const ts = nowTs();
    this.db
      .prepare("UPDATE sessions SET runtime_mode = ?, interaction_mode = ?, updated_at = ? WHERE id = ?")
      .run(input.runtimeMode ?? current.runtimeMode, input.interactionMode ?? current.interactionMode, ts, input.sessionId);
    return this.getSessionById(input.sessionId);
  }

  deleteSession(sessionId: string): void {
    const session = this.getSessionById(sessionId);
    const ts = nowTs();
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    this.db
      .prepare(
        `UPDATE projects
         SET last_active_session_id = (
           SELECT id FROM sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1
         ),
             updated_at = ?
         WHERE id = ? AND last_active_session_id = ?`
      )
      .run(session.projectId, ts, session.projectId, sessionId);
  }

  getSessionById(sessionId: string): Session {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return mapSession(row);
  }

  listMessages(input: { sessionId: string; limit: number; cursor?: string }): MessagePage {
    const params: unknown[] = [input.sessionId];
    let query = "SELECT * FROM messages WHERE session_id = ?";
    if (input.cursor) {
      query += " AND created_at < ?";
      params.push(Number(input.cursor));
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(input.limit);

    const rows = this.db.prepare(query).all(...params) as Record<string, unknown>[];
    const messages = rows.map(mapMessage);
    const next = messages.length === input.limit ? String(messages[messages.length - 1]?.createdAt ?? "") : undefined;
    return { items: messages, nextCursor: next && next.length > 0 ? next : undefined };
  }

  createMessage(input: { sessionId: string; role: Message["role"]; content: string }): Message {
    this.getSessionById(input.sessionId);
    const id = makeId("msg");
    const ts = nowTs();
    this.db
      .prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, input.sessionId, input.role, input.content, ts);
    this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(ts, input.sessionId);
    const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Record<string, unknown>;
    return mapMessage(row);
  }

  createTerminal(input: { projectId: string; name: string; kind: TerminalKind }): Terminal {
    this.getProjectById(input.projectId);
    const id = makeId("trm");
    const ts = nowTs();
    this.db
      .prepare("INSERT INTO terminals (id, project_id, name, kind, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, input.projectId, input.name, input.kind, ts);

    return {
      id,
      projectId: input.projectId,
      name: input.name,
      kind: input.kind,
      createdAt: ts
    };
  }

  setWebTarget(input: { sessionId: string; port: number; path?: string }): SessionWebTarget {
    this.getSessionById(input.sessionId);
    const ts = nowTs();
    const pathValue = input.path ?? "/";
    this.db
      .prepare(
        `INSERT INTO session_web_targets (session_id, port, path, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           port = excluded.port,
           path = excluded.path,
           updated_at = excluded.updated_at`
      )
      .run(input.sessionId, input.port, pathValue, ts);

    return {
      sessionId: input.sessionId,
      port: input.port,
      path: pathValue,
      updatedAt: ts
    };
  }

  getWebTarget(sessionId: string): SessionWebTarget | null {
    const row = this.db
      .prepare("SELECT * FROM session_web_targets WHERE session_id = ?")
      .get(sessionId) as Record<string, unknown> | undefined;
    return mapWebTarget(row);
  }

  activateSession(sessionId: string): ActivatedContext {
    const session = this.getSessionById(sessionId);
    const project = this.getProjectById(session.projectId);

    const webTarget =
      this.getWebTarget(sessionId) ??
      (project.defaultPort
        ? {
            sessionId,
            port: project.defaultPort,
            path: "/",
            updatedAt: nowTs()
          }
        : null);

    this.db
      .prepare("UPDATE projects SET last_active_session_id = ?, updated_at = ? WHERE id = ?")
      .run(sessionId, nowTs(), project.id);

    return {
      project: this.getProjectById(project.id),
      session,
      webTarget,
      serverState: "unknown"
    };
  }

  getPreferences(): AppPreferences {
    const row = this.db
      .prepare("SELECT value FROM app_state WHERE key = ?")
      .get(defaultSessionProviderKey) as Record<string, unknown> | undefined;
    const value = row ? String(row.value) : null;
    if (value === "codex" || value === "claude") {
      return { defaultSessionProvider: value };
    }
    return { defaultSessionProvider: null };
  }

  setDefaultSessionProvider(provider: SessionProvider | null): AppPreferences {
    const ts = nowTs();
    if (provider === null) {
      this.db.prepare("DELETE FROM app_state WHERE key = ?").run(defaultSessionProviderKey);
      return { defaultSessionProvider: null };
    }

    this.db
      .prepare(
        `INSERT INTO app_state (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .run(defaultSessionProviderKey, provider, ts);

    return { defaultSessionProvider: provider };
  }
}
