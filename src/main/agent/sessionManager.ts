import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, accessSync, constants as fsConstants } from "node:fs";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { channels } from "../../shared/ipc";
import type { AgentEvent, SessionProvider } from "../../shared/types";

type AgentRuntimeMode = "full-access" | "approval-required";
type AgentInteractionMode = "default" | "plan";

export interface AgentSessionOpenInput {
  terminalId: string;
  sessionId: string;
  provider: SessionProvider;
  cliSessionName: string;
  cwd: string;
  mode: "create" | "restore";
}

interface CodexTurnPending {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  buffer: string;
}

interface PendingApproval {
  requestId: string;
  jsonRpcId: string | number;
  method: string;
  detail: string;
}

interface RunningCodexSession {
  type: "codex";
  child: ChildProcessWithoutNullStreams;
  nextId: number;
  rpcPending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout }>;
  pendingApprovals: Map<string, PendingApproval>;
  providerThreadId: string | null;
  activeTurnId: string | null;
  currentTurn: CodexTurnPending | null;
  busy: boolean;
  runtimeMode: AgentRuntimeMode;
  interactionMode: AgentInteractionMode;
}

interface RunningClaudeSession {
  type: "claude";
  busy: boolean;
  claudeSessionId: string | null;
  activeChild: ChildProcessWithoutNullStreams | null;
  runtimeMode: AgentRuntimeMode;
  interactionMode: AgentInteractionMode;
}

type RunningSession = {
  terminalId: string;
  sessionId: string;
  provider: SessionProvider;
  cwd: string;
  cliSessionName: string;
} & (RunningCodexSession | RunningClaudeSession);

export interface AgentSessionManagerHooks {
  onSessionNameResolved?: (payload: { sessionId: string; cliSessionName: string }) => void;
  onMessagePersist?: (payload: { sessionId: string; role: "user" | "assistant"; content: string }) => void;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function getShellPath(env: NodeJS.ProcessEnv): string {
  const shell = env.SHELL || "/bin/bash";
  // Ask the login shell to print its PATH and nothing else.
  const result = spawnSync(shell, ["-lc", "echo $PATH"], {
    env,
    encoding: "utf8",
    timeout: 5000
  });
  const printed = (result.stdout ?? "").trim().split(/\r?\n/).pop()?.trim() ?? "";
  return printed.length > 0 ? printed : env.PATH ?? "";
}

function buildEnvWithFullPath(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const shellPath = getShellPath(baseEnv);
  const home = baseEnv.HOME ?? "";
  const extras = [
    `${home}/.npm-global/bin`,
    `${home}/.local/bin`,
    `${home}/.nvm/versions/node/current/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/bin",
    "/bin"
  ].filter(Boolean);

  const merged = [...extras, ...shellPath.split(":")]
    .filter((p, i, arr) => p.length > 0 && arr.indexOf(p) === i)
    .join(":");

  return { ...baseEnv, PATH: merged };
}

function findExecutable(command: string, env: NodeJS.ProcessEnv): string | null {
  // Check if it's already an absolute path.
  if (path.isAbsolute(command)) {
    try {
      accessSync(command, fsConstants.X_OK);
      return command;
    } catch {
      return null;
    }
  }

  // Search PATH entries.
  const dirs = (env.PATH ?? "").split(":");
  for (const dir of dirs) {
    if (!dir) continue;
    const full = path.join(dir, command);
    try {
      accessSync(full, fsConstants.X_OK);
      return full;
    } catch {
      // not found here
    }
  }

  // Ask the shell as a last resort (non-interactive to avoid hangs).
  const shell = env.SHELL || "/bin/bash";
  const result = spawnSync(shell, ["-lc", `command -v ${command} 2>/dev/null || true`], {
    env,
    encoding: "utf8",
    timeout: 5000
  });
  const found = (result.stdout ?? "").trim().split(/\r?\n/).pop()?.trim();
  if (found && found.length > 0 && !found.includes(" ") && existsSync(found)) {
    return found;
  }

  return null;
}

export class AgentSessionManager {
  private readonly sessions = new Map<string, RunningSession>();

  constructor(
    private readonly win: BrowserWindow,
    private readonly hooks: AgentSessionManagerHooks = {}
  ) {}

  isManaged(terminalId: string): boolean {
    return this.sessions.has(terminalId);
  }

  async open(input: AgentSessionOpenInput): Promise<void> {
    if (this.sessions.has(input.terminalId)) {
      return;
    }

    if (input.provider === "codex") {
      await this.openCodex(input);
      return;
    }

    this.openClaude(input);
  }

  async sendTurn(terminalId: string, text: string): Promise<void> {
    const session = this.sessions.get(terminalId);
    if (!session) {
      throw new Error("No session for terminal");
    }

    if (session.busy) {
      throw new Error("Session is busy");
    }

    session.busy = true;
    this.hooks.onMessagePersist?.({ sessionId: session.sessionId, role: "user", content: text });
    this.emit({ kind: "turn.start", terminalId, sessionId: session.sessionId });

    try {
      let assistantText = "";
      if (session.type === "codex") {
        assistantText = await this.sendCodexTurn(session, text);
      } else {
        assistantText = await this.sendClaudeTurn(session, text);
      }
      this.hooks.onMessagePersist?.({ sessionId: session.sessionId, role: "assistant", content: assistantText });
      this.emit({ kind: "turn.complete", terminalId, sessionId: session.sessionId, fullText: assistantText });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ kind: "turn.abort", terminalId, sessionId: session.sessionId, reason: message });
    } finally {
      session.busy = false;
    }
  }

  async interrupt(terminalId: string): Promise<void> {
    const session = this.sessions.get(terminalId);
    if (!session || !session.busy) {
      return;
    }

    if (session.type === "codex") {
      if (!session.activeTurnId) {
        return;
      }
      const threadId = session.providerThreadId ?? session.cliSessionName;
      if (!threadId) {
        return;
      }
      await this.codexRequest(session, "turn/interrupt", { threadId, turnId: session.activeTurnId });
      return;
    }

    if (session.activeChild && !session.activeChild.killed) {
      session.activeChild.kill("SIGINT");
    }
  }

  approve(terminalId: string, requestId: string, decision: "accept" | "acceptForSession" | "decline"): void {
    const session = this.sessions.get(terminalId);
    if (!session || session.type !== "codex") {
      return;
    }

    const approval = session.pendingApprovals.get(requestId);
    if (!approval) {
      return;
    }

    session.pendingApprovals.delete(requestId);
    this.codexRespond(session, approval.jsonRpcId, { decision });
    this.emit({ kind: "approval.resolved", terminalId, sessionId: session.sessionId, requestId, decision });
  }

  resize(_terminalId: string, _cols: number, _rows: number): void {
    // no-op for structured agent sessions
  }

  kill(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }

    if (session.type === "codex" && !session.child.killed) {
      for (const { timeout } of session.rpcPending.values()) {
        clearTimeout(timeout);
      }
      session.rpcPending.clear();
      session.child.kill();
    }

    if (session.type === "claude" && session.activeChild && !session.activeChild.killed) {
      session.activeChild.kill("SIGINT");
    }

    this.sessions.delete(terminalId);
    this.win.webContents.send(channels.terminalsOnExit, { terminalId, code: 0, signal: 0 });
  }

  // ─── Codex ──────────────────────────────────────────────────────────────

  private async openCodex(input: AgentSessionOpenInput): Promise<void> {
    const env = buildEnvWithFullPath(process.env);
    const codexBin = findExecutable("codex", env);

    if (!codexBin) {
      this.emit({
        kind: "session.error",
        terminalId: input.terminalId,
        sessionId: input.sessionId,
        message: `Codex binary not found. Searched PATH: ${env.PATH ?? "(empty)"}. Make sure 'codex' is installed and try opening a terminal to confirm 'which codex'.`
      });
      this.win.webContents.send(channels.terminalsOnExit, { terminalId: input.terminalId, code: 1, signal: 0 });
      return;
    }

    const child = spawn(codexBin, ["app-server"], {
      cwd: input.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const session: RunningSession = {
      type: "codex",
      terminalId: input.terminalId,
      sessionId: input.sessionId,
      provider: "codex",
      cwd: input.cwd,
      cliSessionName: input.cliSessionName,
      child,
      nextId: 1,
      rpcPending: new Map(),
      pendingApprovals: new Map(),
      providerThreadId: null,
      activeTurnId: null,
      currentTurn: null,
      busy: false,
      runtimeMode: "full-access",
      interactionMode: "default"
    };
    this.sessions.set(input.terminalId, session);

    let closed = false;
    const closeSession = (code: number): void => {
      if (closed) {
        return;
      }
      closed = true;
      this.sessions.delete(input.terminalId);
      this.win.webContents.send(channels.terminalsOnExit, { terminalId: input.terminalId, code, signal: 0 });
    };

    let startupStderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      startupStderr += text;
      if (startupStderr.length > 4000) {
        startupStderr = startupStderr.slice(startupStderr.length - 4000);
      }
    });

    let stdoutBuf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf8");
      const lines = stdoutBuf.split(/\r?\n/g);
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          this.onCodexLine(session, line);
        }
      }
    });

    child.on("error", (err) => {
      for (const { timeout, reject } of session.rpcPending.values()) {
        clearTimeout(timeout);
        reject(new Error("Codex failed to start"));
      }
      session.rpcPending.clear();
      if (session.currentTurn) {
        session.currentTurn.reject(new Error("Codex failed to start"));
        session.currentTurn = null;
      }
      const message =
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `Codex CLI not found in PATH (resolved binary: ${codexBin}).`
          : `Failed to start Codex app-server: ${err.message}`;
      this.emit({ kind: "session.error", terminalId: input.terminalId, sessionId: input.sessionId, message });
      closeSession(1);
    });

    child.on("exit", (code) => {
      for (const { timeout, reject } of session.rpcPending.values()) {
        clearTimeout(timeout);
        reject(new Error("Codex exited"));
      }
      session.rpcPending.clear();
      if (session.currentTurn) {
        session.currentTurn.reject(new Error("Codex exited"));
        session.currentTurn = null;
      }
      closeSession(code ?? 0);
    });

    try {
      await this.codexRequest(session, "initialize", {
        clientInfo: { name: "shipdeck", title: "ShipDeck", version: "0.1.0" },
        capabilities: { experimentalApi: true }
      });
      this.codexNotify(session, "initialized", {});

      const threadParams = {
        model: null,
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        cwd: input.cwd
      };

      const resumeThreadId = input.mode === "restore" && isUuidLike(input.cliSessionName) ? input.cliSessionName : null;

      if (resumeThreadId) {
        try {
          await this.codexRequest(session, "thread/resume", { ...threadParams, threadId: resumeThreadId });
        } catch {
          await this.codexRequest(session, "thread/start", threadParams);
        }
      } else {
        await this.codexRequest(session, "thread/start", threadParams);
      }

      this.emit({ kind: "session.ready", terminalId: input.terminalId, sessionId: input.sessionId, provider: "codex" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stderrSummary = startupStderr.trim().split(/\r?\n/).slice(-6).join(" | ");
      const detail = stderrSummary ? ` | stderr: ${stderrSummary}` : "";
      this.emit({
        kind: "session.error",
        terminalId: input.terminalId,
        sessionId: input.sessionId,
        message: `Codex startup failed (bin: ${codexBin}): ${message}${detail}`
      });
      if (!child.killed) {
        child.kill();
      }
      closeSession(1);
    }
  }

  private async sendCodexTurn(session: RunningSession & RunningCodexSession, text: string): Promise<string> {
    const threadId = session.providerThreadId ?? session.cliSessionName;
    if (!threadId || !isUuidLike(threadId)) {
      throw new Error("Codex session missing thread id");
    }

    const turnComplete = new Promise<string>((resolve, reject) => {
      session.currentTurn = { resolve, reject, buffer: "" };
    });

    await this.codexRequest(session, "turn/start", {
      threadId,
      input: [{ type: "text", text, text_elements: [] }]
    });

    return turnComplete;
  }

  private onCodexLine(session: RunningSession & RunningCodexSession, line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    const hasNumericId = typeof parsed.id === "number";
    const hasStringId = typeof parsed.id === "string";
    const method = asString(parsed.method);

    // JSON-RPC response (our outgoing request got answered)
    if ((hasNumericId || hasStringId) && !method) {
      const id = Number(parsed.id);
      const pending = session.rpcPending.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        session.rpcPending.delete(id);
        if (parsed.error) {
          const msg = asString(asObject(parsed.error)?.message) ?? "Codex RPC error";
          pending.reject(new Error(msg));
        } else {
          pending.resolve(parsed.result);
        }
      }
      return;
    }

    if (!method) {
      return;
    }

    // Server-initiated request (needs our response)
    if (method && (hasNumericId || hasStringId)) {
      this.onCodexServerRequest(session, parsed, method);
      return;
    }

    // Notification
    this.onCodexNotification(session, parsed, method);
  }

  private onCodexServerRequest(
    session: RunningSession & RunningCodexSession,
    message: Record<string, unknown>,
    method: string
  ): void {
    const id = (message.id as string | number);
    const params = asObject(message.params) ?? {};

    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval" ||
      method === "item/fileRead/requestApproval"
    ) {
      if (session.runtimeMode === "full-access") {
        this.codexRespond(session, id, { decision: "accept" });
        return;
      }

      const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const detail = asString(params.command) ?? asString(params.reason) ?? asString(params.path) ?? "(no detail)";
      session.pendingApprovals.set(requestId, { requestId, jsonRpcId: id, method, detail });
      this.emit({
        kind: "approval.request",
        terminalId: session.terminalId,
        sessionId: session.sessionId,
        requestId,
        method,
        detail
      });
      return;
    }

    if (method === "item/tool/requestUserInput") {
      const questions = Array.isArray(params.questions) ? params.questions : [];
      const answers: Record<string, string> = {};
      for (const q of questions) {
        const question = asObject(q);
        const qId = asString(question?.id);
        const options = Array.isArray(question?.options) ? question.options : [];
        const firstLabel = asString(asObject(options[0])?.label);
        if (qId && firstLabel) {
          answers[qId] = firstLabel;
        }
      }
      this.codexRespond(session, id, { answers });
      return;
    }

    this.codexRespondError(session, id, -32601, `Unsupported request method: ${method}`);
  }

  private onCodexNotification(
    session: RunningSession & RunningCodexSession,
    message: Record<string, unknown>,
    method: string
  ): void {
    const payload = asObject(message.params) ?? {};

    if (method === "thread/started") {
      const thread = asObject(payload.thread);
      const threadId = asString(thread?.id) ?? asString(payload.threadId);
      if (threadId) {
        session.providerThreadId = threadId;
        if (threadId !== session.cliSessionName) {
          session.cliSessionName = threadId;
          this.hooks.onSessionNameResolved?.({ sessionId: session.sessionId, cliSessionName: threadId });
        }
      }
      return;
    }

    if (method === "turn/started") {
      const turnId = asString(asObject(payload.turn)?.id) ?? asString(payload.turnId);
      if (turnId) {
        session.activeTurnId = turnId;
        if (session.currentTurn) {
          session.currentTurn.buffer = "";
        }
      }
      return;
    }

    if (method === "item/agentMessage/delta") {
      const delta = asString(payload.delta) ?? "";
      if (delta && session.currentTurn) {
        session.currentTurn.buffer += delta;
        this.emit({ kind: "message.delta", terminalId: session.terminalId, sessionId: session.sessionId, delta });
      }
      return;
    }

    if (method === "item/reasoning/textDelta" || method === "item/reasoning/summaryTextDelta") {
      const delta = asString(payload.delta) ?? "";
      if (delta) {
        this.emit({ kind: "thinking.delta", terminalId: session.terminalId, sessionId: session.sessionId, delta });
      }
      return;
    }

    if (method === "turn/diff/updated") {
      const patch = asString(payload.unifiedDiff) ?? asString(payload.diff) ?? asString(payload.patch) ?? "";
      if (patch.trim()) {
        this.emit({ kind: "diff.update", terminalId: session.terminalId, sessionId: session.sessionId, patch });
      }
      return;
    }

    if (method === "turn/plan/updated" || method === "item/plan/delta") {
      const explanation = asString(payload.explanation) ?? asString(payload.delta) ?? asString(payload.text) ?? "";
      const plan = Array.isArray(payload.plan) ? payload.plan : [];
      const lines: string[] = [];
      if (explanation) {
        lines.push(explanation);
      }
      for (const entry of plan) {
        const row = asObject(entry);
        if (!row) continue;
        lines.push(`- [${asString(row.status) ?? "pending"}] ${asString(row.step) ?? ""}`);
      }
      if (lines.length > 0) {
        this.emit({ kind: "plan.delta", terminalId: session.terminalId, sessionId: session.sessionId, delta: lines.join("\n") });
      }
      return;
    }

    if (method === "turn/completed") {
      const turn = session.currentTurn;
      session.currentTurn = null;
      session.activeTurnId = null;
      if (turn) {
        turn.resolve(turn.buffer);
      }
      return;
    }

    if (method === "turn/aborted") {
      const turn = session.currentTurn;
      session.currentTurn = null;
      session.activeTurnId = null;
      if (turn) {
        turn.reject(new Error("Turn aborted"));
      }
      return;
    }

    if (method === "error") {
      const errorMsg = asString(asObject(payload.error)?.message) ?? "Codex runtime error";
      this.emit({ kind: "session.error", terminalId: session.terminalId, sessionId: session.sessionId, message: errorMsg });
      const turn = session.currentTurn;
      if (turn) {
        session.currentTurn = null;
        session.activeTurnId = null;
        turn.reject(new Error(errorMsg));
      }
    }
  }

  // ─── Claude ─────────────────────────────────────────────────────────────

  private openClaude(input: AgentSessionOpenInput): void {
    const session: RunningSession = {
      type: "claude",
      terminalId: input.terminalId,
      sessionId: input.sessionId,
      provider: "claude",
      cwd: input.cwd,
      cliSessionName: input.cliSessionName,
      busy: false,
      claudeSessionId: input.mode === "restore" && isUuidLike(input.cliSessionName) ? input.cliSessionName : null,
      activeChild: null,
      runtimeMode: "full-access",
      interactionMode: "default"
    };
    this.sessions.set(input.terminalId, session);
    this.emit({ kind: "session.ready", terminalId: input.terminalId, sessionId: input.sessionId, provider: "claude" });
  }

  private async sendClaudeTurn(session: RunningSession & RunningClaudeSession, text: string): Promise<string> {
    const env = buildEnvWithFullPath(process.env);
    const claudeBin = findExecutable("claude", env) ?? findExecutable("claude-code", env);
    const npxBin = findExecutable("npx", env);

    let runtimeBin: string | null = null;
    let args: string[] = [];

    if (claudeBin) {
      runtimeBin = claudeBin;
      args = ["-p", "--verbose", "--output-format", "stream-json"];
    } else if (npxBin) {
      runtimeBin = npxBin;
      args = ["--yes", "@anthropic-ai/claude-code", "-p", "--verbose", "--output-format", "stream-json"];
    }

    if (!runtimeBin) {
      throw new Error("Claude CLI not found (checked: claude, claude-code, npx @anthropic-ai/claude-code).");
    }

    if (session.claudeSessionId) {
      args.push("--resume", session.claudeSessionId);
    }

    if (session.interactionMode === "plan") {
      args.push("--permission-mode", "plan");
    } else if (session.runtimeMode === "full-access") {
      args.push("--permission-mode", "bypassPermissions");
    } else {
      args.push("--permission-mode", "default");
    }

    args.push(text);

    const child = spawn(runtimeBin, args, {
      cwd: session.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    session.activeChild = child;

    let assistantBuffer = "";

    await new Promise<void>((resolve, reject) => {
      let buf = "";
      let stderrBuf = "";

      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        const lines = buf.split(/\r?\n/g);
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const delta = this.onClaudeLine(session, line);
          if (delta) {
            assistantBuffer += delta;
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderrBuf += text;
        if (stderrBuf.length > 4000) {
          stderrBuf = stderrBuf.slice(stderrBuf.length - 4000);
        }
      });

      child.on("error", (err) => {
        session.activeChild = null;
        const message =
          (err as NodeJS.ErrnoException).code === "ENOENT"
            ? `Claude runtime not found (bin: ${runtimeBin}).`
            : `Failed to start Claude runtime: ${err.message}`;
        reject(new Error(message));
      });

      child.on("exit", (code, signal) => {
        session.activeChild = null;
        if (signal === "SIGINT") {
          reject(new Error("Interrupted"));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        const stderrSummary = stderrBuf.trim().split(/\r?\n/).slice(-6).join(" | ");
        const detail = stderrSummary ? ` | stderr: ${stderrSummary}` : "";
        reject(new Error(`Claude exited with code ${code ?? 1} (bin: ${runtimeBin})${detail}`));
      });
    });

    return assistantBuffer;
  }

  private onClaudeLine(session: RunningSession & RunningClaudeSession, line: string): string {
    const trimmed = line.trim();
    if (!trimmed) {
      return "";
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return "";
    }

    const type = asString(parsed.type) ?? "";

    if (type === "system" && parsed.subtype === "init") {
      const newId = asString(parsed.session_id);
      if (newId && newId !== session.claudeSessionId) {
        session.claudeSessionId = newId;
        session.cliSessionName = newId;
        this.hooks.onSessionNameResolved?.({ sessionId: session.sessionId, cliSessionName: newId });
      }
      return "";
    }

    if (type === "assistant") {
      const message = asObject(parsed.message);
      const content = Array.isArray(message?.content) ? message.content : [];
      const text = content
        .map((p) => asObject(p))
        .filter((p): p is Record<string, unknown> => p !== undefined && asString(p.type) === "text")
        .map((p) => asString(p.text) ?? "")
        .join("");
      if (text) {
        this.emit({ kind: "message.delta", terminalId: session.terminalId, sessionId: session.sessionId, delta: text });
        return text;
      }
      return "";
    }

    if (type === "result" && Boolean(parsed.is_error)) {
      const result = asString(parsed.result) ?? "Claude error";
      this.emit({ kind: "session.error", terminalId: session.terminalId, sessionId: session.sessionId, message: result });
    }

    return "";
  }

  // ─── Codex JSON-RPC helpers ───────────────────────────────────────────────

  private codexNotify(session: RunningSession & RunningCodexSession, method: string, params: Record<string, unknown>): void {
    if (!session.child.stdin.writable) return;
    session.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  private codexRequest<T>(session: RunningSession & RunningCodexSession, method: string, params: Record<string, unknown>): Promise<T> {
    const id = session.nextId++;
    if (!session.child.stdin.writable) {
      return Promise.reject(new Error("Codex stdin not writable"));
    }
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.rpcPending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }, 30_000);
      session.rpcPending.set(id, { resolve: (v) => resolve(v as T), reject, timeout });
      session.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private codexRespond(session: RunningSession & RunningCodexSession, id: string | number, result: Record<string, unknown>): void {
    if (!session.child.stdin.writable) return;
    session.child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  private codexRespondError(session: RunningSession & RunningCodexSession, id: string | number, code: number, message: string): void {
    if (!session.child.stdin.writable) return;
    session.child.stdin.write(`${JSON.stringify({ id, error: { code, message } })}\n`);
  }

  // ─── Emit helper ─────────────────────────────────────────────────────────

  private emit(event: AgentEvent): void {
    this.win.webContents.send(channels.agentOnEvent, event);
  }
}
