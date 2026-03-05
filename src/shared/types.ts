export type Role = "user" | "assistant" | "system";
export type TerminalKind = "server" | "shell";
export type SessionProvider = "codex" | "claude";

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  devCommand: string;
  defaultPort: number | null;
  lastActiveSessionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectGitStatus {
  branch: string;
  added: number;
  removed: number;
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  provider: SessionProvider;
  cliSessionName: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  createdAt: number;
}

export interface SessionWebTarget {
  sessionId: string;
  port: number;
  path: string;
  updatedAt: number;
}

export interface Terminal {
  id: string;
  projectId: string;
  name: string;
  kind: TerminalKind;
  createdAt: number;
}

export interface ActivatedContext {
  project: Project;
  session: Session;
  webTarget: SessionWebTarget | null;
  serverState: "stopped" | "running" | "unknown";
}

export interface MessagePage {
  items: Message[];
  nextCursor?: string;
}

export interface AppPreferences {
  defaultSessionProvider: SessionProvider | null;
}

export interface ThemeTokens {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  radii: Record<string, string>;
  shadows: Record<string, string>;
  motion: Record<string, string>;
}
