import type { BrowserWindow } from "electron";
import { channels } from "../../shared/ipc";
import { parsePortFromLog } from "../portDetection";

interface IPtyLike {
  onData(handler: (data: string) => void): void;
  onExit(handler: (payload: { exitCode: number; signal: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

interface RunningTerminal {
  ptyProcess: IPtyLike;
  kind: "server" | "shell";
  projectId: string;
  latestPort: number | null;
  pendingOutput: string;
  flushTimer: NodeJS.Timeout | null;
}

export class PtyManager {
  private readonly terminals = new Map<string, RunningTerminal>();
  private readonly outputBatchWindowMs = 8;

  constructor(
    private readonly win: BrowserWindow,
    private readonly onPortDetected?: (payload: { projectId: string; port: number }) => void
  ) {}

  open(input: {
    terminalId: string;
    projectId: string;
    cwd: string;
    kind: "server" | "shell";
    command?: string;
  }): void {
    if (this.terminals.has(input.terminalId)) {
      return;
    }

    // Lazily import node-pty so ABI mismatches don't crash app startup.
    const pty = require("node-pty") as {
      spawn: (file: string, args: string[], options: Record<string, unknown>) => IPtyLike;
    };

    const commandText = input.command?.trim() ?? "";
    const hasCommand = commandText.length > 0;
    const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
    const args =
      process.platform === "win32"
        ? hasCommand
          ? ["-NoLogo", "-Command", commandText]
          : ["-NoLogo"]
        : hasCommand
          ? ["-lc", commandText]
          : [];
    const windowsOptions =
      process.platform === "win32"
        ? {
            useConpty: true,
            useConptyDll: true
          }
        : {};

    let proc: IPtyLike;
    try {
      proc = pty.spawn(shell, args, {
        name: "xterm-color",
        cols: 100,
        rows: 30,
        cwd: input.cwd,
        env: process.env as Record<string, string>,
        ...windowsOptions
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start terminal in '${input.cwd}': ${reason}`);
    }

    const running: RunningTerminal = {
      ptyProcess: proc,
      kind: input.kind,
      projectId: input.projectId,
      latestPort: null,
      pendingOutput: "",
      flushTimer: null
    };

    proc.onData((data) => {
      running.pendingOutput += data;
      if (!running.flushTimer) {
        running.flushTimer = setTimeout(() => {
          running.flushTimer = null;
          if (!running.pendingOutput) {
            return;
          }
          this.win.webContents.send(channels.terminalsOnData, {
            terminalId: input.terminalId,
            data: running.pendingOutput
          });
          running.pendingOutput = "";
        }, this.outputBatchWindowMs);
      }
      if (running.kind !== "server") {
        return;
      }
      if (!data.includes("localhost") && !data.includes("127.0.0.1") && !data.includes("0.0.0.0") && !data.includes("[::1]")) {
        return;
      }
      const port = parsePortFromLog(data);
      if (port && port !== running.latestPort) {
        running.latestPort = port;
        this.win.webContents.send(channels.serverOnPortDetected, {
          projectId: running.projectId,
          port,
          source: "log"
        });
        this.onPortDetected?.({ projectId: running.projectId, port });
      }
    });

    proc.onExit(({ exitCode, signal }) => {
      if (running.flushTimer) {
        clearTimeout(running.flushTimer);
        running.flushTimer = null;
      }
      if (running.pendingOutput) {
        this.win.webContents.send(channels.terminalsOnData, {
          terminalId: input.terminalId,
          data: running.pendingOutput
        });
        running.pendingOutput = "";
      }
      this.win.webContents.send(channels.terminalsOnExit, {
        terminalId: input.terminalId,
        code: exitCode,
        signal
      });
      this.terminals.delete(input.terminalId);
    });

    this.terminals.set(input.terminalId, running);

    // Command mode uses shell startup args; interactive mode remains plain shell.
  }

  write(terminalId: string, data: string): void {
    this.terminals.get(terminalId)?.ptyProcess.write(data);
  }

  resize(terminalId: string, cols: number, rows: number): void {
    this.terminals.get(terminalId)?.ptyProcess.resize(cols, rows);
  }

  kill(terminalId: string): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return;
    }
    if (terminal.flushTimer) {
      clearTimeout(terminal.flushTimer);
      terminal.flushTimer = null;
    }
    terminal.ptyProcess.kill();
    this.terminals.delete(terminalId);
  }

  getLatestPortByProject(projectId: string): number | null {
    for (const value of this.terminals.values()) {
      if (value.projectId === projectId && value.latestPort) {
        return value.latestPort;
      }
    }
    return null;
  }
}
