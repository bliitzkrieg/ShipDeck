import type { StoreApi } from "zustand";
import type { Project, ProjectGitStatus, Session, SessionProvider } from "../../../shared/types";
import type {
  ActiveTerminalTabByProject,
  ServerTerminalsByProject,
  SessionTabsByProject,
  SessionTerminalsBySessionId,
  SessionsByProject
} from "../types";

export interface WorkspaceState {
  projects: Project[];
  sessionsByProject: SessionsByProject;
  gitStatusesByProject: Record<string, ProjectGitStatus | null>;
  defaultSessionProvider: SessionProvider | null;
  activeProjectId: string | null;
  activeSessionId: string | null;
  webTargetText: string;
  didInitializeSelection: boolean;

  serverError: string | null;
  serverTerminalsByProject: ServerTerminalsByProject;
  sessionTerminalsBySessionId: SessionTerminalsBySessionId;
  sessionTabsByProject: SessionTabsByProject;
  activeTerminalTabByProject: ActiveTerminalTabByProject;
  shellTabsByProject: Record<string, string[]>;
  shellTerminalsByTabId: Record<string, { projectId: string; terminalId: string; label: string }>;

  showSessionProviderModal: boolean;
  sessionProviderProjectId: string | null;
  rememberSessionProviderChoice: boolean;
  showProviderOverrideMenu: string | null;

  showProjectModal: boolean;
  editingProjectId: string | null;
  projectName: string;
  projectPath: string;
  projectCommand: string;
  projectDefaultPort: string;
  projectModalError: string | null;

  showSessionRenameModal: boolean;
  sessionRenameProjectId: string | null;
  editingSessionId: string | null;
  sessionTitleDraft: string;
  sessionRenameError: string | null;
  showTerminalRenameModal: boolean;
  terminalRenameProjectId: string | null;
  editingTerminalTabId: string | null;
  terminalTitleDraft: string;
  terminalRenameError: string | null;
}

export interface WorkspaceActions {
  setActiveProjectId: (projectId: string | null) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setWebTargetText: (value: string) => void;
  setRememberSessionProviderChoice: (value: boolean) => void;
  setProjectName: (value: string) => void;
  setProjectPath: (value: string) => void;
  setProjectCommand: (value: string) => void;
  setProjectDefaultPort: (value: string) => void;
  setSessionTitleDraft: (value: string) => void;
  setTerminalTitleDraft: (value: string) => void;

  refreshGitStatuses: () => Promise<void>;
  refreshPreferences: () => Promise<void>;
  refreshSessionsForProject: (projectId: string) => Promise<Session[]>;
  refreshProjects: () => Promise<void>;
  refreshLiveView: () => Promise<void>;

  ensureSessionTabOpen: (projectId: string, sessionId: string) => void;
  openSessionTerminal: (session: Session, mode: "create" | "restore") => Promise<void>;
  closeSessionTab: (projectId: string, sessionId: string) => Promise<void>;
  startServer: (projectId?: string | null) => Promise<void>;
  stopServer: (projectId?: string | null) => Promise<void>;
  setActiveTerminalTab: (projectId: string, tabKey: string) => void;
  openRegularTerminal: (projectId: string) => Promise<void>;
  closeTerminalTabByKey: (projectId: string, tabKey: string) => Promise<void>;
  removeTerminalMappingsByTerminalId: (terminalId: string) => void;
  removeServerTerminalMappingByTerminalId: (terminalId: string) => void;

  activateSession: (projectId: string, sessionId: string) => Promise<void>;
  openCreateSessionFlow: (projectId: string) => Promise<void>;
  onProviderMenuOpenChange: (projectId: string, open: boolean) => void;
  onCreateSessionWithProvider: (projectId: string, provider: SessionProvider) => void;
  onClearDefaultProvider: () => void;
  onSelectProvider: (provider: SessionProvider) => void;
  closeProviderModal: () => void;

  openCreateProject: () => void;
  openEditProject: (project: Project) => void;
  closeProjectModal: () => void;
  submitProject: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  deleteSession: (projectId: string, sessionId: string) => Promise<void>;

  openRenameSession: (projectId: string, session: Session) => void;
  closeRenameModal: () => void;
  submitSessionRename: () => void;
  openRenameTerminal: (projectId: string, tabKey: string) => void;
  closeTerminalRenameModal: () => void;
  submitTerminalRename: () => void;
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions;
export type WorkspaceSet = StoreApi<WorkspaceStore>["setState"];
export type WorkspaceGet = StoreApi<WorkspaceStore>["getState"];
