import type {
  ActivatedContext,
  AgentEvent,
  AppPreferences,
  Message,
  MessagePage,
  ProjectGitStatus,
  Project,
  Session,
  SessionWebTarget,
  Terminal
} from "../shared/types";

declare global {
  interface Window {
    api: {
      projects: {
        list(): Promise<Project[]>;
        create(input: { name: string; rootPath: string; devCommand: string; defaultPort?: number | null }): Promise<Project>;
        update(input: {
          projectId: string;
          name?: string;
          rootPath?: string;
          devCommand?: string;
          defaultPort?: number | null;
        }): Promise<Project>;
        delete(input: { projectId: string }): Promise<{ ok: true }>;
        pickRootPath(): Promise<string | null>;
        gitStatuses(): Promise<Record<string, ProjectGitStatus | null>>;
      };
      sessions: {
        list(input: { projectId: string }): Promise<Session[]>;
        create(input: { projectId: string; title?: string; provider: Session["provider"]; cliSessionName: string }): Promise<Session>;
        rename(input: { sessionId: string; title: string }): Promise<Session>;
        delete(input: { sessionId: string }): Promise<{ ok: true }>;
      };
      messages: {
        list(input: { sessionId: string; limit: number; cursor?: string }): Promise<MessagePage>;
        create(input: { sessionId: string; role: Message["role"]; content: string }): Promise<Message>;
      };
      context: {
        activateSession(input: { sessionId: string }): Promise<ActivatedContext>;
        onChanged(handler: (payload: ActivatedContext) => void): () => void;
      };
      terminals: {
        create(input: { projectId: string; name: string; kind: "server" | "shell" }): Promise<Terminal>;
        open(input: {
          terminalId: string;
          projectId: string;
          cwd: string;
          kind: "server" | "shell";
          command?: string;
          sessionId?: string;
          sessionProvider?: string;
        }): Promise<{ ok: true }>;
        write(input: { terminalId: string; data: string }): Promise<{ ok: true }>;
        writeInput(input: { terminalId: string; data: string }): void;
        resize(input: { terminalId: string; cols: number; rows: number }): Promise<{ ok: true }>;
        kill(input: { terminalId: string }): Promise<{ ok: true }>;
        onData(handler: (payload: { terminalId: string; data: string }) => void): () => void;
        onExit(handler: (payload: { terminalId: string; code: number; signal?: number }) => void): () => void;
      };
      server: {
        start(input: { projectId: string }): Promise<{ terminalId: string }>;
        restart(input: { projectId: string }): Promise<{ terminalId: string }>;
        getLatestPort(input: { projectId: string }): Promise<{ port: number | null }>;
        onPortDetected(handler: (payload: { projectId: string; port: number; source: string }) => void): () => void;
      };
      webTarget: {
        set(input: { sessionId: string; port: number; path?: string }): Promise<SessionWebTarget>;
      };
      preferences: {
        get(): Promise<AppPreferences>;
        setDefaultSessionProvider(input: { provider: Session["provider"] | null }): Promise<AppPreferences>;
      };
      webView: {
        setVisible(input: { visible: boolean }): Promise<{ ok: true }>;
        setBounds(input: { x: number; y: number; width: number; height: number }): Promise<{ ok: true }>;
        loadTarget(input: { url: string }): Promise<{ ok: true }>;
      };
      system: {
        openExternal(input: { url: string }): Promise<{ ok: true }>;
      };
      appWindow: {
        minimize(): Promise<{ ok: true }>;
        toggleMaximize(): Promise<{ ok: true }>;
        close(): Promise<{ ok: true }>;
      };
      agent: {
        sendTurn(input: { terminalId: string; text: string }): Promise<{ ok: true }>;
        interrupt(input: { terminalId: string }): Promise<{ ok: true }>;
        approve(input: { terminalId: string; requestId: string; decision: "accept" | "acceptForSession" | "decline" }): Promise<{ ok: true }>;
        onEvent(handler: (event: AgentEvent) => void): () => void;
      };
    };
  }
}

export {};
