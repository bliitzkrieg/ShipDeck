import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  activateSessionInputSchema,
  createMessageInputSchema,
  createProjectInputSchema,
  createSessionInputSchema,
  createTerminalInputSchema,
  listMessagesInputSchema,
  renameSessionInputSchema,
  setDefaultSessionProviderInputSchema,
  setWebTargetInputSchema,
  startServerInputSchema,
  terminalIdInputSchema,
  terminalResizeInputSchema,
  terminalWriteInputSchema,
  updateProjectInputSchema
} from "../shared/schemas";
import { channels } from "../shared/ipc";
import { initDb } from "./db";
import { Repository } from "./db/repository";
import { PtyManager } from "./pty/manager";
import { AgentSessionManager } from "./agent/sessionManager";
import { WebViewManager } from "./webview/manager";

let mainWindow: BrowserWindow | null = null;

function resolveBrowserWindowIconPath(): string | undefined {
  if (process.platform === "darwin") {
    return undefined;
  }

  const fileName = process.platform === "win32" ? "icon.ico" : "512x512.png";
  const candidates = [
    path.join(app.getAppPath(), "build", "icons", fileName),
    path.join(process.resourcesPath, "build", "icons", fileName),
    path.join(process.cwd(), "build", "icons", fileName)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function isNavigationAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const errno = "errno" in error ? Number((error as { errno?: unknown }).errno) : Number.NaN;
  return code === "ERR_ABORTED" || errno === -3;
}

function assertExistingDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Project root path does not exist: ${dirPath}`);
  }
  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    throw new Error(`Project root path is not a directory: ${dirPath}`);
  }
}

function readProjectGitStatus(rootPath: string): { branch: string; added: number; removed: number } | null {
  try {
    const branch = execFileSync("git", ["-C", rootPath, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    const unstaged = execFileSync("git", ["-C", rootPath, "diff", "--numstat"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const staged = execFileSync("git", ["-C", rootPath, "diff", "--cached", "--numstat"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const porcelain = execFileSync("git", ["-C", rootPath, "status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    const sumNumstat = (value: string): { added: number; removed: number } => {
      let added = 0;
      let removed = 0;
      for (const line of value.split(/\r?\n/)) {
        if (!line.trim()) {
          continue;
        }
        const [addedText, removedText] = line.split("\t");
        const add = Number(addedText);
        const del = Number(removedText);
        if (Number.isFinite(add)) {
          added += add;
        }
        if (Number.isFinite(del)) {
          removed += del;
        }
      }
      return { added, removed };
    };

    const unstagedTotals = sumNumstat(unstaged);
    const stagedTotals = sumNumstat(staged);
    const untrackedCount = porcelain
      .split(/\r?\n/)
      .filter((line) => line.startsWith("?? "))
      .length;

    return {
      branch: branch.length > 0 ? branch : "HEAD",
      added: unstagedTotals.added + stagedTotals.added + untrackedCount,
      removed: unstagedTotals.removed + stagedTotals.removed
    };
  } catch {
    return null;
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#090b10",
    icon: resolveBrowserWindowIconPath(),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "preload", "index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.webContents.setIgnoreMenuShortcuts(true);
  win.maximize();
  return win;
}

function loadMainWindowContent(win: BrowserWindow): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
  }
}

function registerIpc(win: BrowserWindow): void {
  const db = initDb();
  const repo = new Repository(db);
  const web = new WebViewManager(win);
  const agentSessions = new AgentSessionManager(win, {
    onSessionNameResolved: ({ sessionId, cliSessionName }) => {
      try {
        repo.updateSessionCliSessionName({ sessionId, cliSessionName });
      } catch (err) {
        console.warn("Failed to persist provider session id:", err);
      }
    },
    onMessagePersist: ({ sessionId, role, content }) => {
      try {
        repo.createMessage({ sessionId, role, content });
      } catch (err) {
        console.warn("Failed to persist agent message:", err);
      }
    }
  });
  const pty = new PtyManager(win, ({ projectId, port }) => {
    const project = repo.getProjectById(projectId);
    const targetPort = project.defaultPort ?? port;
    if (project.lastActiveSessionId) {
      try {
        repo.setWebTarget({ sessionId: project.lastActiveSessionId, port: targetPort, path: "/" });
      } catch (error) {
        // Self-heal stale references when a previously active session was deleted.
        repo.clearProjectLastActiveSession(projectId);
        console.warn("Skipping web target update due to stale session:", error);
      }
    }
    void web.loadTarget(`http://localhost:${targetPort}/`).catch(() => {
      // Ignore navigation errors; renderer still receives event updates.
    });
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") {
      return;
    }
    const key = input.key.toLowerCase();
    const isRefreshCombo = (input.control || input.meta) && key === "r";
    const isF5 = key === "f5";
    if (isRefreshCombo) {
      event.preventDefault();
      web.reload();
      return;
    }
    if (isF5) {
      event.preventDefault();
    }
  });

  win.on("resize", () => {
    web.layout();
  });

  ipcMain.handle(channels.projectsList, () => repo.listProjects());
  ipcMain.handle(channels.projectsGitStatuses, () => {
    const items = repo.listProjects();
    const output: Record<string, { branch: string; added: number; removed: number } | null> = {};
    for (const item of items) {
      output[item.id] = readProjectGitStatus(item.rootPath);
    }
    return output;
  });

  ipcMain.handle(channels.projectsCreate, (_event, rawInput) => {
    const input = createProjectInputSchema.parse(rawInput);
    return repo.createProject({
      name: input.name,
      rootPath: input.rootPath,
      devCommand: input.devCommand,
      defaultPort: input.defaultPort
    });
  });

  ipcMain.handle(channels.projectsUpdate, (_event, rawInput) => {
    const input = updateProjectInputSchema.parse(rawInput);
    return repo.updateProject({
      projectId: input.projectId,
      name: input.name,
      rootPath: input.rootPath,
      devCommand: input.devCommand,
      defaultPort: input.defaultPort
    });
  });

  ipcMain.handle(channels.projectsDelete, (_event, rawInput: { projectId: string }) => {
    repo.deleteProject(rawInput.projectId);
    return { ok: true };
  });

  ipcMain.handle(channels.projectsPickRootPath, async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Select Project Folder",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(channels.sessionsList, (_event, rawInput: { projectId: string }) => {
    return repo.listSessions(rawInput.projectId);
  });

  ipcMain.handle(channels.sessionsCreate, (_event, rawInput) => {
    const input = createSessionInputSchema.parse(rawInput);
    return repo.createSession(input);
  });

  ipcMain.handle(channels.sessionsRename, (_event, rawInput) => {
    const input = renameSessionInputSchema.parse(rawInput);
    return repo.renameSession(input);
  });

  ipcMain.handle(channels.sessionsDelete, (_event, rawInput: { sessionId: string }) => {
    repo.deleteSession(rawInput.sessionId);
    return { ok: true };
  });

  ipcMain.handle(channels.messagesList, (_event, rawInput) => {
    const input = listMessagesInputSchema.parse(rawInput);
    return repo.listMessages(input);
  });

  ipcMain.handle(channels.messagesCreate, (_event, rawInput) => {
    const input = createMessageInputSchema.parse(rawInput);
    return repo.createMessage(input);
  });

  ipcMain.handle(channels.contextActivateSession, async (_event, rawInput) => {
    const input = activateSessionInputSchema.parse(rawInput);
    const context = repo.activateSession(input.sessionId);

    if (context.webTarget) {
      const targetUrl = `http://localhost:${context.webTarget.port}${context.webTarget.path}`;
      try {
        await web.loadTarget(targetUrl);
      } catch (error) {
        if (!isNavigationAbortError(error)) {
          throw error;
        }
        // Navigation was interrupted by another load/visibility change; keep context activation successful.
      }
    }

    win.webContents.send(channels.contextOnChanged, context);
    return context;
  });

  ipcMain.handle(channels.terminalsCreate, (_event, rawInput) => {
    const input = createTerminalInputSchema.parse(rawInput);
    return repo.createTerminal(input);
  });

  ipcMain.handle(channels.terminalsOpen, async (_event, rawInput: { terminalId: string; projectId: string; cwd: string; kind: "server" | "shell"; command?: string; sessionId?: string; sessionProvider?: string }) => {
    // If this terminal is for a structured agent session, use AgentSessionManager.
    const { sessionId, sessionProvider } = rawInput;
    if (sessionId && (sessionProvider === "codex" || sessionProvider === "claude")) {
      const session = repo.getSessionById(sessionId);
      try {
        await agentSessions.open({
          terminalId: rawInput.terminalId,
          sessionId,
          provider: sessionProvider,
          cliSessionName: session.cliSessionName,
          cwd: rawInput.cwd,
          mode: session.cliSessionName && session.cliSessionName.includes("-") ? "create" : "restore"
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        win.webContents.send(channels.agentOnEvent, {
          kind: "session.error",
          terminalId: rawInput.terminalId,
          sessionId,
          message: `Failed to open ${sessionProvider} session: ${message}`
        });
      }
      return { ok: true };
    }
    pty.open(rawInput);
    return { ok: true };
  });

  ipcMain.handle(channels.terminalsWrite, (_event, rawInput) => {
    const input = terminalWriteInputSchema.parse(rawInput);
    if (!agentSessions.isManaged(input.terminalId)) {
      pty.write(input.terminalId, input.data);
    }
    return { ok: true };
  });

  ipcMain.on(channels.terminalsWriteInput, (_event, rawInput) => {
    try {
      const input = terminalWriteInputSchema.parse(rawInput);
      if (!agentSessions.isManaged(input.terminalId)) {
        pty.write(input.terminalId, input.data);
      }
    } catch {
      // Ignore malformed fire-and-forget input payloads.
    }
  });

  ipcMain.handle(channels.terminalsResize, (_event, rawInput) => {
    const input = terminalResizeInputSchema.parse(rawInput);
    if (!agentSessions.isManaged(input.terminalId)) {
      pty.resize(input.terminalId, input.cols, input.rows);
    }
    return { ok: true };
  });

  ipcMain.handle(channels.terminalsKill, (_event, rawInput) => {
    const input = terminalIdInputSchema.parse(rawInput);
    if (agentSessions.isManaged(input.terminalId)) {
      agentSessions.kill(input.terminalId);
    } else {
      pty.kill(input.terminalId);
    }
    return { ok: true };
  });

  // ─── Structured agent session commands ────────────────────────────────────
  ipcMain.handle(channels.agentSendTurn, async (_event, rawInput: { terminalId: string; text: string }) => {
    await agentSessions.sendTurn(rawInput.terminalId, rawInput.text);
    return { ok: true };
  });

  ipcMain.handle(channels.agentInterrupt, async (_event, rawInput: { terminalId: string }) => {
    await agentSessions.interrupt(rawInput.terminalId);
    return { ok: true };
  });

  ipcMain.handle(channels.agentApprove, (_event, rawInput: { terminalId: string; requestId: string; decision: "accept" | "acceptForSession" | "decline" }) => {
    agentSessions.approve(rawInput.terminalId, rawInput.requestId, rawInput.decision);
    return { ok: true };
  });

  ipcMain.handle(channels.serverStart, (_event, rawInput) => {
    const input = startServerInputSchema.parse(rawInput);
    const project = repo.getProjectById(input.projectId);
    assertExistingDirectory(project.rootPath);
    const terminal = repo.createTerminal({ projectId: project.id, name: "Server", kind: "server" });
    pty.open({
      terminalId: terminal.id,
      projectId: project.id,
      cwd: project.rootPath,
      kind: "server",
      command: project.devCommand
    });

    return { terminalId: terminal.id };
  });

  ipcMain.handle(channels.serverRestart, (_event, rawInput) => {
    const input = startServerInputSchema.parse(rawInput);
    const project = repo.getProjectById(input.projectId);
    assertExistingDirectory(project.rootPath);
    const terminal = repo.createTerminal({ projectId: project.id, name: "Server", kind: "server" });
    pty.open({
      terminalId: terminal.id,
      projectId: project.id,
      cwd: project.rootPath,
      kind: "server",
      command: project.devCommand
    });
    return { terminalId: terminal.id };
  });

  ipcMain.handle(channels.serverGetLatestPort, (_event, rawInput) => {
    const input = startServerInputSchema.parse(rawInput);
    return { port: pty.getLatestPortByProject(input.projectId) };
  });

  ipcMain.handle(channels.webTargetSet, (_event, rawInput) => {
    const input = setWebTargetInputSchema.parse(rawInput);
    return repo.setWebTarget(input);
  });

  ipcMain.handle(channels.preferencesGet, () => {
    return repo.getPreferences();
  });

  ipcMain.handle(channels.preferencesSetDefaultSessionProvider, (_event, rawInput) => {
    const input = setDefaultSessionProviderInputSchema.parse(rawInput);
    return repo.setDefaultSessionProvider(input.provider);
  });

  ipcMain.handle(channels.webViewSetVisible, (_event, rawInput: { visible: boolean }) => {
    web.setVisible(Boolean(rawInput?.visible));
    return { ok: true };
  });

  ipcMain.handle(
    channels.webViewSetBounds,
    (
      _event,
      rawInput: {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    ) => {
      const width = Math.max(0, Math.floor(rawInput.width));
      const height = Math.max(0, Math.floor(rawInput.height));
      const x = Math.max(0, Math.floor(rawInput.x));
      const y = Math.max(0, Math.floor(rawInput.y));
      web.setBounds({ x, y, width, height });
      return { ok: true };
    }
  );

  ipcMain.handle(channels.webViewLoadTarget, async (_event, rawInput: { url: string }) => {
    await web.loadTarget(rawInput.url);
    return { ok: true };
  });

  ipcMain.handle(channels.systemOpenExternal, async (_event, rawInput: { url: string }) => {
    await shell.openExternal(rawInput.url);
    return { ok: true };
  });

  ipcMain.handle(channels.appWindowMinimize, () => {
    win.minimize();
    return { ok: true };
  });

  ipcMain.handle(channels.appWindowToggleMaximize, () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return { ok: true };
  });

  ipcMain.handle(channels.appWindowClose, () => {
    win.close();
    return { ok: true };
  });
}

app.whenReady().then(() => {
  mainWindow = createMainWindow();
  registerIpc(mainWindow);
  loadMainWindowContent(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      registerIpc(mainWindow);
      loadMainWindowContent(mainWindow);
    }
  });
}).catch((error) => {
  console.error("Failed to initialize Electron app:", error);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
