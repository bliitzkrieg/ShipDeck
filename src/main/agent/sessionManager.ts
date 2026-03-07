import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { BrowserWindow } from "electron";
import { channels } from "../../shared/ipc";
import type { SessionProvider } from "../../shared/types";

interface AgentSessionOpenInput {
  terminalId: string;
  sessionId: string;
  provider: SessionProvider;
  cliSessionName: string;
  cwd: string;
  mode: "create" | "restore";
}

interface RunningCodexSession {
  type: "codex";
  child: ChildProcessWithoutNullStreams;
  nextId: number;
  pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
  currentInput: string;
  providerThreadId: string | null;
  busy: boolean;
}

interface RunningClaudeSession {
  type: "claude";
  currentInput: string;
  busy: boolean;
  claudeSessionId: string | null;
}

type RunningAgentSession = {
  terminalId: string;
  sessionId: string;
  provider: SessionProvider;
  cwd: string;
  cliSessionName: string;
} & (RunningCodexSession | RunningClaudeSession);

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

export class AgentSessionManager {
  private readonly sessions = new Map<string, RunningAgentSession>();

  constructor(
    private readonly win: BrowserWindow,
    private readonly onSessionNameResolved?: (payload: {
      sessionId: string;
      cliSessionName: string;
    }) => void
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
        this.emitData(terminalId, "^C\r\n> ");
        session.currentInput = "";
        continue;
      }

      // Ignore ANSI escape control sequences from xterm keypresses.
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
      busy: false
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
      approvalPolicy: "never",
      sandbox: "danger-full-access",
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

    this.emitData(input.terminalId, "✅ Codex connected. Type a prompt and press Enter.\r\n> ");
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
        input.mode === "restore" && isUuidLike(input.cliSessionName) ? input.cliSessionName : null
    };
    this.sessions.set(input.terminalId, session);
    this.emitData(
      input.terminalId,
      "🚀 Claude stream-json session ready. Type a prompt and press Enter.\r\n> "
    );
  }

  private async sendPrompt(session: RunningAgentSession, prompt: string): Promise<void> {
    session.busy = true;
    try {
      if (session.type === "codex") {
        await this.sendCodexPrompt(session, prompt);
      } else {
        await this.sendClaudePrompt(session, prompt);
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

  private async sendCodexPrompt(session: RunningAgentSession & RunningCodexSession, prompt: string): Promise<void> {
    const threadId = session.providerThreadId ?? session.cliSessionName;
    if (!threadId || !isUuidLike(threadId)) {
      throw new Error("Codex session is missing thread id");
    }

    await this.codexRequest(session, "turn/start", {
      threadId,
      input: [
        {
          type: "text",
          text: prompt,
          text_elements: []
        }
      ]
    });
  }

  private async sendClaudePrompt(session: RunningAgentSession & RunningClaudeSession, prompt: string): Promise<void> {
    const args = [
      "--yes",
      "@anthropic-ai/claude-code",
      "-p",
      "--verbose",
      "--output-format",
      "stream-json"
    ];

    if (session.claudeSessionId) {
      args.push("--resume", session.claudeSessionId);
    }

    args.push(prompt);

    const child = spawn("npx", args, {
      cwd: session.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    await new Promise<void>((resolve, reject) => {
      let stdoutBuffer = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split(/\r?\n/g);
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          this.onClaudeLine(session, line);
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = stripAnsi(chunk.toString("utf8"));
        if (text.trim()) {
          this.emitData(session.terminalId, `\r\n[stderr] ${text}\r\n`);
        }
      });

      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Claude exited with code ${code ?? 1}`));
      });
    });
  }

  private onCodexLine(session: RunningAgentSession & RunningCodexSession, line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.emitData(session.terminalId, `${line}\r\n`);
      return;
    }

    if (typeof parsed.id === "number") {
      const pending = session.pending.get(parsed.id);
      if (pending) {
        session.pending.delete(parsed.id);
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
      return;
    }

    const method = typeof parsed.method === "string" ? parsed.method : "";
    const payload = (parsed.params ?? {}) as Record<string, unknown>;

    if (method === "thread/started") {
      const thread = payload.thread as Record<string, unknown> | undefined;
      const threadId = typeof thread?.id === "string" ? thread.id : undefined;
      if (threadId) {
        session.providerThreadId = threadId;
        if (threadId !== session.cliSessionName) {
          session.cliSessionName = threadId;
          this.onSessionNameResolved?.({
            sessionId: session.sessionId,
            cliSessionName: threadId
          });
        }
      }
      return;
    }

    if (method === "item/agentMessage/delta") {
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (delta) {
        this.emitData(session.terminalId, delta);
      }
      return;
    }

    if (method === "item/reasoning/textDelta" || method === "item/reasoning/summaryTextDelta") {
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (delta) {
        this.emitData(session.terminalId, delta);
      }
      return;
    }

    if (method === "turn/completed") {
      this.emitData(session.terminalId, "\r\n✅ Turn completed");
      return;
    }

    if (method === "error") {
      const error = payload.error as Record<string, unknown> | undefined;
      const message = typeof error?.message === "string" ? error.message : "Codex runtime error";
      this.emitData(session.terminalId, `\r\n❌ ${message}`);
      return;
    }
  }

  private onClaudeLine(session: RunningAgentSession & RunningClaudeSession, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      this.emitData(session.terminalId, `${trimmed}\r\n`);
      return;
    }

    const type = typeof parsed.type === "string" ? parsed.type : "";
    if (type === "system" && parsed.subtype === "init") {
      const sessionId = typeof parsed.session_id === "string" ? parsed.session_id : null;
      if (sessionId && sessionId !== session.cliSessionName) {
        session.claudeSessionId = sessionId;
        session.cliSessionName = sessionId;
        this.onSessionNameResolved?.({
          sessionId: session.sessionId,
          cliSessionName: sessionId
        });
      }
      return;
    }

    if (type === "assistant") {
      const message = parsed.message as { content?: Array<{ type?: string; text?: string }> } | undefined;
      const content = Array.isArray(message?.content) ? message.content : [];
      const text = content
        .filter((part) => part && part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      if (text) {
        this.emitData(session.terminalId, `${text}`);
      }
      return;
    }

    if (type === "result") {
      const isError = Boolean(parsed.is_error);
      if (isError) {
        const result = typeof parsed.result === "string" ? parsed.result : "Claude turn failed";
        this.emitData(session.terminalId, `\r\n⚠️ ${result}`);
      }
      return;
    }
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
      session.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject
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

  private emitData(terminalId: string, data: string): void {
    this.win.webContents.send(channels.terminalsOnData, {
      terminalId,
      data
    });
  }
}
