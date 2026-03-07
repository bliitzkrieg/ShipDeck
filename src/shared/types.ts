export type Role = "user" | "assistant" | "system";
export type TerminalKind = "server" | "shell";
export type SessionProvider = "codex" | "claude" | "opencode";

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

// ─── Structured agent session events ───────────────────────────────────────

export interface AgentEventBase {
  terminalId: string;
  sessionId: string;
}

export interface AgentEventSessionReady extends AgentEventBase {
  kind: "session.ready";
  provider: SessionProvider;
}

export interface AgentEventTurnStart extends AgentEventBase {
  kind: "turn.start";
}

export interface AgentEventMessageDelta extends AgentEventBase {
  kind: "message.delta";
  delta: string;
}

export interface AgentEventThinkingDelta extends AgentEventBase {
  kind: "thinking.delta";
  delta: string;
}

export interface AgentEventPlanDelta extends AgentEventBase {
  kind: "plan.delta";
  delta: string;
}

export interface AgentEventDiffUpdate extends AgentEventBase {
  kind: "diff.update";
  patch: string;
}

export interface AgentEventApprovalRequest extends AgentEventBase {
  kind: "approval.request";
  requestId: string;
  method: string;
  detail: string;
}

export interface AgentEventApprovalResolved extends AgentEventBase {
  kind: "approval.resolved";
  requestId: string;
  decision: string;
}

export interface AgentEventTurnComplete extends AgentEventBase {
  kind: "turn.complete";
  fullText: string;
}

export interface AgentEventTurnAbort extends AgentEventBase {
  kind: "turn.abort";
  reason: string;
}

export interface AgentEventSessionError extends AgentEventBase {
  kind: "session.error";
  message: string;
}

export type AgentEvent =
  | AgentEventSessionReady
  | AgentEventTurnStart
  | AgentEventMessageDelta
  | AgentEventThinkingDelta
  | AgentEventPlanDelta
  | AgentEventDiffUpdate
  | AgentEventApprovalRequest
  | AgentEventApprovalResolved
  | AgentEventTurnComplete
  | AgentEventTurnAbort
  | AgentEventSessionError;
