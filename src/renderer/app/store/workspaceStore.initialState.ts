import type { WorkspaceState } from "./workspaceStore.types";

export const workspaceInitialState: WorkspaceState = {
  projects: [],
  sessionsByProject: {},
  gitStatusesByProject: {},
  defaultSessionProvider: null,
  activeProjectId: null,
  activeSessionId: null,
  webTargetText: "No active localhost target",
  didInitializeSelection: false,

  serverError: null,
  serverTerminalsByProject: {},
  sessionTerminalsBySessionId: {},
  sessionTabsByProject: {},
  activeTerminalTabByProject: {},

  showSessionProviderModal: false,
  sessionProviderProjectId: null,
  rememberSessionProviderChoice: false,
  showProviderOverrideMenu: null,

  showProjectModal: false,
  editingProjectId: null,
  projectName: "",
  projectPath: "",
  projectCommand: "pnpm dev",
  projectDefaultPort: "",
  projectModalError: null,

  showSessionRenameModal: false,
  sessionRenameProjectId: null,
  editingSessionId: null,
  sessionTitleDraft: "",
  sessionRenameError: null
};
