import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { BrowserWindow } from "electron";
import { channels } from "../../shared/ipc";
import type { SessionProvider } from "../../shared/types";

type AgentRuntimeMode = "full-access" | "approval-required";
type AgentInteractionMode = "default" | "plan";

interface AgentSessionOpenInput {
  terminalId: string;
  sessionId: string;
  provider: SessionProvider;
  cliSessionName: string;
  cwd: string;
  mode: "create" | "restore";
  runtimeMode?: AgentRuntimeMode;
  interactionMode?: AgentInteractionMode;
}

interface CodexTurnPending {
  resolve: (assistantText: string) => void;
  reject: (error: Error) => void;
  assistantBuffer: string;
  turnId: string | null;
}

interface RunningCodexSession {
  type: "codex";
  child: ChildProcessWithoutNullStreams;
  nextId: number;
  pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>;
  currentInput: string;
  providerThreadId: string | null;
  activeTurnId: string | null;
  currentTurn: CodexTurnPending | null;
  busy: boolean;
  interactionMode: AgentInteractionMode;
  runtimeMode: AgentRuntimeMode;
}

interface RunningClaudeSession {
  type: "claude";
  currentInput: string;
  busy: boolean;
  claudeSessionId: string | null;
  activeChild: ChildProcessWithoutNullStreams | null;
  interactionMode: AgentInteractionMode;
  runtimeMode: AgentRuntimeMode;
}

type RunningAgentSession = {
  terminalId: string;
  sessionId: string;
  provider: SessionProvider;
  cwd: string;
  cliSessionName: string;
} & (RunningCodexSession | RunningClaudeSession);

interface AgentSessionManagerHooks {
  onSessionNameResolved?: (payload: {
    sessionId: string;
    cliSessionName: string;
  }) => void;
  onMessagePersist?: (payload: {
    sessionId: string;
    role: "user" | "assistant";
    content: string;
  }) => void;
  onSessionModeChanged?: (payload: {
    sessionId: string;
    runtimeMode?: AgentRuntimeMode;
    interactionMode?: AgentInteractionMode;
  }) => void;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stripAnsi(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === "\u001b" && input[i + 1] === "[") {
      i += 2;
      while (i < input.length && input[i] !== "m") {
        i += 1;
      }
      if (i < input.length && input[i] === "m") {
        i += 1;
      }
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export class AgentSessionManager {
  private readonly sessions = new Map<string, RunningAgentSession>();

  constructor(private readonly win: BrowserWindow, private readonly hooks: AgentSessionManagerHooks = {}) {}

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

  write(terminalId: string, data: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }

    for (const char of data) {
      if (char === "\r" || char === "\n") {
        const prompt = session.currentInput.trim();
        this.emitData(terminalId, "\r\n");
        session.currentInput = "";

        if (!prompt) {
          this.emitData(terminalId, "> ");
          continue;
        }

        if (this.handleCommand(session, prompt)) {
          continue;
        }

        if (session.busy) {
          this.emitData(terminalId, "⏳ Busy, wait for current turn...\r\n> ");
          continue;
        }

        void this.sendPrompt(session, prompt);
        continue;
      }

      if (char === "\u007f") {
        if (session.currentInput.length > 0) {
          session.currentInput = session.currentInput.slice(0, -1);
          this.emitData(terminalId, "\b \b");
        }
        continue;
      }

      if (char === "\u0003") {
        session.currentInput = "";
        void this.interruptSession(session);
        continue;
      }

      // Ignore ANSI escape starter from xterm key sequences.
      if (char === "\u001b") {
        continue;
      }

      session.currentInput += char;
      this.emitData(terminalId, char);
    }
  }

  resize(_terminalId: string, _cols: number, _rows: number): void {
    // no-op for agent sessions
  }

  kill(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }

    if (session.type === "codex" && !session.child.killed) {
      session.child.kill();
    }

    if (session.type === "claude" && session.activeChild && !session.activeChild.killed) {
      session.activeChild.kill("SIGINT");
    }

    this.sessions.delete(terminalId);
    this.win.webContents.send(channels.terminalsOnExit, {
      terminalId,
      code: 0,
      signal: 0
    });
  }

  private async openCodex(input: AgentSessionOpenInput): Promise<void> {
    const child = spawn("codex", ["app-server"], {
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const session: RunningAgentSession = {
      type: "codex",
      terminalId: input.terminalId,
      sessionId: input.sessionId,
      provider: "codex",
      cwd: input.cwd,
      cliSessionName: input.cliSessionName,
      child,
      nextId: 1,
      pending: new Map(),
      currentInput: "",
      providerThreadId: null,
      activeTurnId: null,
      currentTurn: null,
      busy: false,
      interactionMode: input.interactionMode ?? "default",
      runtimeMode: input.runtimeMode ?? "full-access"
    };

    this.sessions.set(input.terminalId, session);

    let stdoutBuffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/g);
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        this.onCodexLine(session, line);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = stripAnsi(chunk.toString("utf8"));
      if (text.trim()) {
        this.emitData(input.terminalId, `\r\n[stderr] ${text}\r\n`);
      }
    });

    child.on("exit", (code, signal) => {
      for (const pending of session.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Codex session closed before request completed"));
      }
      session.pending.clear();
      if (session.currentTurn) {
        session.currentTurn.reject(new Error("Codex session exited during active turn"));
        session.currentTurn = null;
      }

      this.sessions.delete(input.terminalId);
      this.win.webContents.send(channels.terminalsOnExit, {
        terminalId: input.terminalId,
        code: code ?? 0,
        signal: signal ? 1 : 0
      });
    });

    this.emitData(input.terminalId, "🚀 Starting Codex app-server session...\r\n");

    await this.codexRequest(session, "initialize", {
      clientInfo: { name: "shipdeck", title: "ShipDeck", version: "0.1.0" },
      capabilities: { experimentalApi: true }
    });
    this.codexNotify(session, "initialized", {});

    let resumeThreadId: string | null = null;
    if (input.mode === "restore" && isUuidLike(input.cliSessionName)) {
      resumeThreadId = input.cliSessionName;
    }

    const threadParams = {
      model: null,
      approvalPolicy: session.runtimeMode === "approval-required" ? "on-request" : "never",
      sandbox: session.runtimeMode === "approval-required" ? "workspace-write" : "danger-full-access",
      cwd: input.cwd
    };

    if (resumeThreadId) {
      try {
        await this.codexRequest(session, "thread/resume", {
          ...threadParams,
          threadId: resumeThreadId
        });
      } catch {
        await this.codexRequest(session, "thread/start", threadParams);
      }
    } else {
      await this.codexRequest(session, "thread/start", threadParams);
    }

    this.emitData(input.terminalId, "✅ Codex connected. Type a prompt and press Enter.\r\nType /help for commands.\r\n> ");
  }

  private openClaude(input: AgentSessionOpenInput): void {
    const session: RunningAgentSession = {
      type: "claude",
      terminalId: input.terminalId,
      sessionId: input.sessionId,
      provider: "claude",
      cwd: input.cwd,
      cliSessionName: input.cliSessionName,
      currentInput: "",
      busy: false,
      claudeSessionId:
        input.mode === "restore" && isUuidLike(input.cliSessionName) ? input.cliSessionName : null,
      activeChild: null,
      interactionMode: input.interactionMode ?? "default",
      runtimeMode: input.runtimeMode ?? "full-access"
    };
    this.sessions.set(input.terminalId, session);
    this.emitData(
      input.terminalId,
      "🚀 Claude stream-json session ready. Type a prompt and press Enter.\r\nType /help for commands.\r\n> "
    );
  }

  private handleCommand(session: RunningAgentSession, prompt: string): boolean {
    if (!prompt.startsWith("/")) {
      return false;
    }

    const [cmd] = prompt.split(/\s+/, 1);
    switch (cmd) {
      case "/help":
        this.emitData(
          session.terminalId,
          [
            "Commands:",
            "  /help        Show available commands",
            "  /plan        Switch interaction mode to plan",
            "  /default     Switch interaction mode to default",
            "  /supervised  Switch runtime mode to approval-required",
            "  /fullaccess  Switch runtime mode to full-access",
            "  /interrupt   Interrupt current turn",
            "  /status      Show session runtime status",
            ""
          ].join("\r\n")
        );
        this.emitData(session.terminalId, "> ");
        return true;
      case "/plan":
        session.interactionMode = "plan";
        this.hooks.onSessionModeChanged?.({
          sessionId: session.sessionId,
          interactionMode: "plan"
        });
        this.emitData(session.terminalId, "Switched to plan mode.\r\n> ");
        return true;
      case "/default":
        session.interactionMode = "default";
        this.hooks.onSessionModeChanged?.({
          sessionId: session.sessionId,
          interactionMode: "default"
        });
        this.emitData(session.terminalId, "Switched to default mode.\r\n> ");
        return true;
      case "/supervised":
        session.runtimeMode = "approval-required";
        this.hooks.onSessionModeChanged?.({
          sessionId: session.sessionId,
          runtimeMode: "approval-required"
        });
        this.emitData(session.terminalId, "Switched to supervised runtime mode. Reopen session to apply launch-time sandbox policy.\r\n> ");
        return true;
      case "/fullaccess":
        session.runtimeMode = "full-access";
        this.hooks.onSessionModeChanged?.({
          sessionId: session.sessionId,
          runtimeMode: "full-access"
        });
        this.emitData(session.terminalId, "Switched to full-access runtime mode. Reopen session to apply launch-time sandbox policy.\r\n> ");
        return true;
      case "/interrupt":

        void this.interruptSession(session);
        return true;
      case "/status": {
        const providerId = session.provider === "codex" ? session.providerThreadId : session.claudeSessionId;
        this.emitData(
          session.terminalId,
          `provider=${session.provider} runtime=${session.runtimeMode} mode=${session.interactionMode} busy=${session.busy} id=${providerId ?? "n/a"}\r\n> `
        );
        return true;
      }
      default:
        this.emitData(session.terminalId, `Unknown command: ${cmd}\r\n> `);
        return true;
    }
  }

  private async interruptSession(session: RunningAgentSession): Promise<void> {
    if (!session.busy) {
      this.emitData(session.terminalId, "^C\r\nNo active turn.\r\n> ");
      return;
    }

    this.emitData(session.terminalId, "^C\r\nInterrupting...\r\n");

    if (session.type === "codex") {
      if (!session.activeTurnId) {
        this.emitData(session.terminalId, "No active turn id available yet.\r\n> ");
        return;
      }
      const threadId = session.providerThreadId ?? session.cliSessionName;
      if (!threadId) {
        this.emitData(session.terminalId, "Missing thread id.\r\n> ");
        return;
      }
      try {
        await this.codexRequest(session, "turn/interrupt", {
          threadId,
          turnId: session.activeTurnId
        });
      } catch (error) {
        this.emitData(
          session.terminalId,
          `Interrupt failed: ${error instanceof Error ? error.message : String(error)}\r\n> `
        );
      }
      return;
    }

    if (session.activeChild && !session.activeChild.killed) {
      session.activeChild.kill("SIGINT");
      this.emitData(session.terminalId, "Claude turn interrupted.\r\n> ");
      return;
    }

    this.emitData(session.terminalId, "No active process to interrupt.\r\n> ");
  }

  private async sendPrompt(session: RunningAgentSession, prompt: string): Promise<void> {
    session.busy = true;
    this.persistMessage(session.sessionId, "user", prompt);

    try {
      let assistantText = "";
      if (session.type === "codex") {
        assistantText = await this.sendCodexPrompt(session, prompt);
      } else {
        assistantText = await this.sendClaudePrompt(session, prompt);
      }
      if (assistantText.trim().length > 0) {
        this.persistMessage(session.sessionId, "assistant", assistantText.trim());
      }
    } catch (error) {
      this.emitData(
        session.terminalId,
        `❌ ${error instanceof Error ? error.message : String(error)}\r\n`
      );
    } finally {
      session.busy = false;
      this.emitData(session.terminalId, "\r\n> ");
    }
  }

  private async sendCodexPrompt(session: RunningAgentSession & RunningCodexSession, prompt: string): Promise<string> {
    const threadId = session.providerThreadId ?? session.cliSessionName;
    if (!threadId || !isUuidLike(threadId)) {
      throw new Error("Codex session is missing thread id");
    }

    if (session.currentTurn) {
      throw new Error("Codex turn already active");
    }

    const completed = new Promise<string>((resolve, reject) => {
      session.currentTurn = {
        resolve,
        reject,
        assistantBuffer: "",
        turnId: null
      };
    });

    const startResponse = await this.codexRequest<{ turn?: { id?: string } }>(session, "turn/start", {
      threadId,
      input: [
        {
          type: "text",
          text: prompt,
          text_elements: []
        }
      ],
      ...(session.interactionMode !== "default"
        ? {
            collaborationMode: {
              mode: session.interactionMode,
              settings: {
                model: "gpt-5.3-codex",
                reasoning_effort: "medium",
                developer_instructions:
                  session.interactionMode === "plan"
                    ? "Plan mode: focus on planning and avoid mutating actions until the user asks to execute."
                    : "Default mode: execute requested tasks directly."
              }
            }
          }
        : {})
    });

    const responseTurnId = asString(asObject(startResponse)?.turn && asObject(startResponse)?.turn?.id);
    if (responseTurnId) {
      session.activeTurnId = responseTurnId;
      if (session.currentTurn) {
        session.currentTurn.turnId = responseTurnId;
      }
    }

    return completed;
  }

  private async sendClaudePrompt(session: RunningAgentSession & RunningClaudeSession, prompt: string): Promise<string> {
    const args = [
      "--yes",
      "@anthropic-ai/claude-code",
      "-p",
      "--verbose",
      "--output-format",
      "stream-json",
      "--include-partial-messages"
    ];

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

    args.push(prompt);

    const child = spawn("npx", args, {
      cwd: session.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    session.activeChild = child;

    let assistantBuffer = "";

    await new Promise<void>((resolve, reject) => {
      let stdoutBuffer = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split(/\r?\n/g);
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const delta = this.onClaudeLine(session, line);
          if (delta) {
            assistantBuffer += delta;
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = stripAnsi(chunk.toString("utf8"));
        if (text.trim()) {
          this.emitData(session.terminalId, `\r\n[stderr] ${text}\r\n`);
        }
      });

      child.on("exit", (code, signal) => {
        session.activeChild = null;
        if (signal === "SIGINT") {
          reject(new Error("Claude turn interrupted"));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Claude exited with code ${code ?? 1}`));
      });
    });

    return assistantBuffer;
  }

  private onCodexLine(session: RunningAgentSession & RunningCodexSession, line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.emitData(session.terminalId, `${line}\r\n`);
      return;
    }

    const method = asString(parsed.method);
    const hasRequestId = typeof parsed.id === "number" || typeof parsed.id === "string";

    if (method) {
      if (hasRequestId) {
        this.onCodexServerRequest(session, parsed);
      } else {
        this.onCodexNotification(session, parsed);
      }
      return;
    }

    if (hasRequestId) {
      const responseId = Number(parsed.id);
      const pending = session.pending.get(responseId);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      session.pending.delete(responseId);
      if (parsed.error) {
        const message =
          typeof parsed.error === "object" && parsed.error && "message" in parsed.error
            ? String((parsed.error as { message?: unknown }).message ?? "Codex request failed")
            : "Codex request failed";
        pending.reject(new Error(message));
        return;
      }
      pending.resolve(parsed.result);
    }
  }

  private onCodexServerRequest(session: RunningAgentSession & RunningCodexSession, message: Record<string, unknown>): void {
    const method = asString(message.method);
    if (!method) {
      return;
    }

    const id = message.id;
    if (id === undefined || id === null) {
      return;
    }

    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval" ||
      method === "item/fileRead/requestApproval"
    ) {
      this.emitData(session.terminalId, `\r\n[approval] ${method} → auto-accepted\r\n`);
      this.codexRespond(session, id, { decision: "accept" });
      return;
    }

    if (method === "item/tool/requestUserInput") {
      const params = asObject(message.params);
      const questions = Array.isArray(params?.questions) ? params.questions : [];
      const answers: Record<string, string> = {};
      for (const q of questions) {
        const question = asObject(q);
        const questionId = asString(question?.id);
        const options = Array.isArray(question?.options) ? question?.options : [];
        const firstOption = asObject(options[0]);
        const label = asString(firstOption?.label);
        if (questionId && label) {
          answers[questionId] = label;
        }
      }
      this.emitData(session.terminalId, "\r\n[input] provider asked for user input; auto-answered with first option.\r\n");
      this.codexRespond(session, id, { answers });
      return;
    }

    this.codexRespondError(session, id, -32601, `Unsupported request: ${method}`);
  }

  private onCodexNotification(session: RunningAgentSession & RunningCodexSession, message: Record<string, unknown>): void {
    const method = asString(message.method) ?? "";
    const payload = asObject(message.params) ?? {};

    if (method === "thread/started") {
      const thread = asObject(payload.thread);
      const threadId = asString(thread?.id) ?? asString(payload.threadId);
      if (threadId) {
        session.providerThreadId = threadId;
        if (threadId !== session.cliSessionName) {
          session.cliSessionName = threadId;
          this.hooks.onSessionNameResolved?.({
            sessionId: session.sessionId,
            cliSessionName: threadId
          });
        }
      }
      return;
    }

    if (method === "turn/started") {
      const turn = asObject(payload.turn);
      const turnId = asString(turn?.id) ?? asString(payload.turnId);
      if (turnId) {
        session.activeTurnId = turnId;
        if (session.currentTurn) {
          session.currentTurn.turnId = turnId;
        }
      }
      return;
    }

    if (method === "item/agentMessage/delta") {
      const delta = asString(payload.delta) ?? "";
      if (delta) {
        if (session.currentTurn) {
          session.currentTurn.assistantBuffer += delta;
        }
        this.emitData(session.terminalId, delta);
      }
      return;
    }

    if (method === "item/reasoning/textDelta" || method === "item/reasoning/summaryTextDelta") {
      const delta = asString(payload.delta) ?? "";
      if (delta) {
        this.emitData(session.terminalId, delta);
      }
      return;
    }

    if (method === "turn/completed") {
      const completedTurn = session.currentTurn;
      session.currentTurn = null;
      session.activeTurnId = null;
      this.emitData(session.terminalId, "\r\n✅ Turn completed");
      if (completedTurn) {
        completedTurn.resolve(completedTurn.assistantBuffer);
      }
      return;
    }

    if (method === "turn/aborted") {
      const abortedTurn = session.currentTurn;
      session.currentTurn = null;
      session.activeTurnId = null;
      this.emitData(session.terminalId, "\r\n⚠️ Turn aborted");
      if (abortedTurn) {
        abortedTurn.reject(new Error("Turn aborted"));
      }
      return;
    }

    if (method === "error") {
      const error = asObject(payload.error);
      const messageText = asString(error?.message) ?? "Codex runtime error";
      this.emitData(session.terminalId, `\r\n❌ ${messageText}`);
      if (session.currentTurn) {
        const activeTurn = session.currentTurn;
        session.currentTurn = null;
        session.activeTurnId = null;
        activeTurn.reject(new Error(messageText));
      }
      return;
    }
  }

  private onClaudeLine(session: RunningAgentSession & RunningClaudeSession, line: string): string {
    const trimmed = line.trim();
    if (!trimmed) {
      return "";
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      this.emitData(session.terminalId, `${trimmed}\r\n`);
      return "";
    }

    const type = asString(parsed.type) ?? "";
    if (type === "system" && parsed.subtype === "init") {
      const sessionId = asString(parsed.session_id) ?? null;
      if (sessionId && sessionId !== session.cliSessionName) {
        session.claudeSessionId = sessionId;
        session.cliSessionName = sessionId;
        this.hooks.onSessionNameResolved?.({
          sessionId: session.sessionId,
          cliSessionName: sessionId
        });
      }
      return "";
    }

    if (type === "assistant") {
      const message = asObject(parsed.message);
      const content = Array.isArray(message?.content) ? message.content : [];
      const text = content
        .map((part) => asObject(part))
        .filter((part): part is Record<string, unknown> => part !== undefined)
        .filter((part) => asString(part.type) === "text")
        .map((part) => asString(part.text) ?? "")
        .join("");
      if (text) {
        this.emitData(session.terminalId, text);
        return text;
      }
      return "";
    }

    if (type === "result") {
      const isError = Boolean(parsed.is_error);
      if (isError) {
        const result = asString(parsed.result) ?? "Claude turn failed";
        this.emitData(session.terminalId, `\r\n⚠️ ${result}`);
      }
      return "";
    }

    return "";
  }

  private codexNotify(
    session: RunningAgentSession & RunningCodexSession,
    method: string,
    params: Record<string, unknown>
  ): void {
    if (!session.child.stdin.writable) {
      return;
    }

    session.child.stdin.write(
      `${JSON.stringify({
        method,
        params
      })}\n`
    );
  }

  private codexRespond(
    session: RunningAgentSession & RunningCodexSession,
    id: string | number,
    result: Record<string, unknown>
  ): void {
    if (!session.child.stdin.writable) {
      return;
    }

    session.child.stdin.write(
      `${JSON.stringify({
        id,
        result
      })}\n`
    );
  }

  private codexRespondError(
    session: RunningAgentSession & RunningCodexSession,
    id: string | number,
    code: number,
    message: string
  ): void {
    if (!session.child.stdin.writable) {
      return;
    }

    session.child.stdin.write(
      `${JSON.stringify({
        id,
        error: {
          code,
          message
        }
      })}\n`
    );
  }

  private codexRequest<T>(
    session: RunningAgentSession & RunningCodexSession,
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const id = session.nextId;
    session.nextId += 1;

    if (!session.child.stdin.writable) {
      return Promise.reject(new Error("Codex process stdin is not writable"));
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.pending.delete(id);
        reject(new Error(`Timed out waiting for Codex response to ${method}`));
      }, 30_000);

      session.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout
      });

      session.child.stdin.write(
        `${JSON.stringify({
          id,
          method,
          params
        })}\n`
      );
    });
  }

  private persistMessage(sessionId: string, role: "user" | "assistant", content: string): void {
    if (!content.trim()) {
      return;
    }
    this.hooks.onMessagePersist?.({
      sessionId,
      role,
      content
    });
  }

  private emitData(terminalId: string, data: string): void {
    this.win.webContents.send(channels.terminalsOnData, {
      terminalId,
      data
    });
  }
}
