import type { Project, ProjectGitStatus, Session, SessionProvider } from "../../shared/types";

export type SessionsByProject = Record<string, Session[]>;
export type ServerTerminalsByProject = Record<string, string>;
export type SessionTerminalsBySessionId = Record<string, string>;
export type SessionTabsByProject = Record<string, string[]>;
export type ActiveTerminalTabByProject = Record<string, string>;

export interface TerminalTabViewModel {
  key: string;
  label: string;
  kind: "server" | "session" | "shell";
  sessionId: string | null;
  terminalId: string | null;
  closable: boolean;
}

export interface ProjectSidebarModel {
  projects: Project[];
  sessionsByProject: SessionsByProject;
  activeProjectId: string | null;
  activeSessionId: string | null;
  activeTerminalTabKey: string | null;
  serverTerminalsByProject: ServerTerminalsByProject;
  shellTabsByProject: Record<string, string[]>;
  shellTerminalsByTabId: Record<string, { projectId: string; terminalId: string; label: string }>;
  defaultSessionProvider: SessionProvider | null;
  showProviderOverrideMenu: string | null;
}

export interface ProjectSidebarActions {
  onShowCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
  onToggleServer: (projectId: string, running: boolean) => void;
  onActivateSession: (projectId: string, sessionId: string) => void;
  onActivateTerminalTab: (projectId: string, tabKey: string) => void;
  onRenameSession: (projectId: string, session: Session) => void;
  onRenameTerminal: (projectId: string, tabKey: string) => void;
  onDeleteSession: (projectId: string, sessionId: string) => void;
  onCloseTerminalTab: (projectId: string, tabKey: string) => void;
  onOpenRegularTerminal: (projectId: string) => void;
  onOpenCreateSessionFlow: (projectId: string) => void;
  onProviderMenuOpenChange: (projectId: string, open: boolean) => void;
  onCreateSessionWithProvider: (projectId: string, provider: SessionProvider) => void;
  onClearDefaultProvider: () => void;
}

export interface WorkspacePanelModel {
  isServerRunning: boolean;
  previewSplitPercent: number;
  webTargetText: string;
  serverError: string | null;
  terminalTabs: TerminalTabViewModel[];
  activeTerminalTabKey: string | null;
  activeProjectId: string | null;
  activeTerminalId: string | null;
  /** The full Session object for the currently visible session tab, if any. */
  activeSession: Session | null;
}

export interface WorkspacePanelActions {
  onSelectTerminalTab: (tabKey: string) => void;
  onCloseSessionTab: (sessionId: string) => void;
  onCloseTerminalTab: (tabKey: string) => void;
  onSplitterMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export interface ActiveWorkspaceSelection {
  activeProject: Project | null;
  activeSessions: Session[];
  activeProjectGitStatus: ProjectGitStatus | null;
  isServerRunning: boolean;
  activeTerminalTabKey: string | null;
  activeTerminalId: string | null;
}
