import { contextBridge, ipcRenderer } from "electron";
import type {
  ActivatedContext,
  AppPreferences,
  Message,
  MessagePage,
  ProjectGitStatus,
  Project,
  Session,
  SessionWebTarget,
  Terminal
} from "../shared/types";
import { channels } from "../shared/ipc";

type Unsubscribe = () => void;

const api = {
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke(channels.projectsList),
    create: (input: { name: string; rootPath: string; devCommand: string; defaultPort?: number | null }): Promise<Project> =>
      ipcRenderer.invoke(channels.projectsCreate, input),
    update: (input: {
      projectId: string;
      name?: string;
      rootPath?: string;
      devCommand?: string;
      defaultPort?: number | null;
    }): Promise<Project> => ipcRenderer.invoke(channels.projectsUpdate, input),
    delete: (input: { projectId: string }): Promise<{ ok: true }> => ipcRenderer.invoke(channels.projectsDelete, input),
    pickRootPath: (): Promise<string | null> => ipcRenderer.invoke(channels.projectsPickRootPath),
    gitStatuses: (): Promise<Record<string, ProjectGitStatus | null>> => ipcRenderer.invoke(channels.projectsGitStatuses)
  },
  sessions: {
    list: (input: { projectId: string }): Promise<Session[]> => ipcRenderer.invoke(channels.sessionsList, input),
    create: (input: { projectId: string; title?: string; provider: Session["provider"]; cliSessionName: string }): Promise<Session> =>
      ipcRenderer.invoke(channels.sessionsCreate, input),
    rename: (input: { sessionId: string; title: string }): Promise<Session> =>
      ipcRenderer.invoke(channels.sessionsRename, input),
    delete: (input: { sessionId: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke(channels.sessionsDelete, input)
  },
  messages: {
    list: (input: { sessionId: string; limit: number; cursor?: string }): Promise<MessagePage> =>
      ipcRenderer.invoke(channels.messagesList, input),
    create: (input: { sessionId: string; role: Message["role"]; content: string }): Promise<Message> =>
      ipcRenderer.invoke(channels.messagesCreate, input)
  },
  context: {
    activateSession: (input: { sessionId: string }): Promise<ActivatedContext> =>
      ipcRenderer.invoke(channels.contextActivateSession, input),
    onChanged: (handler: (payload: ActivatedContext) => void): Unsubscribe => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ActivatedContext) => handler(payload);
      ipcRenderer.on(channels.contextOnChanged, listener);
      return () => ipcRenderer.removeListener(channels.contextOnChanged, listener);
    }
  },
  terminals: {
    create: (input: { projectId: string; name: string; kind: "server" | "shell" }): Promise<Terminal> =>
      ipcRenderer.invoke(channels.terminalsCreate, input),
    open: (input: {
      terminalId: string;
      projectId: string;
      cwd: string;
      kind: "server" | "shell";
      command?: string;
    }): Promise<{ ok: true }> => ipcRenderer.invoke(channels.terminalsOpen, input),
    write: (input: { terminalId: string; data: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke(channels.terminalsWrite, input),
    writeInput: (input: { terminalId: string; data: string }): void => {
      ipcRenderer.send(channels.terminalsWriteInput, input);
    },
    resize: (input: { terminalId: string; cols: number; rows: number }): Promise<{ ok: true }> =>
      ipcRenderer.invoke(channels.terminalsResize, input),
    kill: (input: { terminalId: string }): Promise<{ ok: true }> => ipcRenderer.invoke(channels.terminalsKill, input),
    onData: (handler: (payload: { terminalId: string; data: string }) => void): Unsubscribe => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { terminalId: string; data: string }) => handler(payload);
      ipcRenderer.on(channels.terminalsOnData, listener);
      return () => ipcRenderer.removeListener(channels.terminalsOnData, listener);
    },
    onExit: (handler: (payload: { terminalId: string; code: number; signal?: number }) => void): Unsubscribe => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { terminalId: string; code: number; signal?: number }) =>
        handler(payload);
      ipcRenderer.on(channels.terminalsOnExit, listener);
      return () => ipcRenderer.removeListener(channels.terminalsOnExit, listener);
    }
  },
  server: {
    start: (input: { projectId: string }): Promise<{ terminalId: string }> => ipcRenderer.invoke(channels.serverStart, input),
    restart: (input: { projectId: string }): Promise<{ terminalId: string }> =>
      ipcRenderer.invoke(channels.serverRestart, input),
    onPortDetected: (handler: (payload: { projectId: string; port: number; source: string }) => void): Unsubscribe => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { projectId: string; port: number; source: string }
      ) => handler(payload);
      ipcRenderer.on(channels.serverOnPortDetected, listener);
      return () => ipcRenderer.removeListener(channels.serverOnPortDetected, listener);
    }
  },
  webTarget: {
    set: (input: { sessionId: string; port: number; path?: string }): Promise<SessionWebTarget> =>
      ipcRenderer.invoke(channels.webTargetSet, input)
  },
  preferences: {
    get: (): Promise<AppPreferences> => ipcRenderer.invoke(channels.preferencesGet),
    setDefaultSessionProvider: (input: { provider: Session["provider"] | null }): Promise<AppPreferences> =>
      ipcRenderer.invoke(channels.preferencesSetDefaultSessionProvider, input)
  },
  webView: {
    setVisible: (input: { visible: boolean }): Promise<{ ok: true }> => ipcRenderer.invoke(channels.webViewSetVisible, input),
    setBounds: (input: { x: number; y: number; width: number; height: number }): Promise<{ ok: true }> =>
      ipcRenderer.invoke(channels.webViewSetBounds, input),
    loadTarget: (input: { url: string }): Promise<{ ok: true }> => ipcRenderer.invoke(channels.webViewLoadTarget, input)
  },
  system: {
    openExternal: (input: { url: string }): Promise<{ ok: true }> => ipcRenderer.invoke(channels.systemOpenExternal, input)
  },
  appWindow: {
    minimize: (): Promise<{ ok: true }> => ipcRenderer.invoke(channels.appWindowMinimize),
    toggleMaximize: (): Promise<{ ok: true }> => ipcRenderer.invoke(channels.appWindowToggleMaximize),
    close: (): Promise<{ ok: true }> => ipcRenderer.invoke(channels.appWindowClose)
  }
};

contextBridge.exposeInMainWorld("api", api);
