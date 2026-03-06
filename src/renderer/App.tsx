import { useCallback, useEffect, useMemo, useRef } from "react";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { WindowBar } from "./components/WindowBar";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { ProjectModal } from "./components/modals/ProjectModal";
import { SessionRenameModal } from "./components/modals/SessionRenameModal";
import { SessionProviderModal } from "./components/modals/SessionProviderModal";
import { useInitialSessionOpen } from "./app/hooks/useInitialSessionOpen";
import { usePreviewSplit } from "./app/hooks/usePreviewSplit";
import { useWebviewController } from "./app/hooks/useWebviewController";
import { selectActiveWorkspace, selectTerminalTabs } from "./app/selectors";
import { useWorkspaceStore } from "./app/store";
import type { ProjectSidebarActions, ProjectSidebarModel, WorkspacePanelActions, WorkspacePanelModel } from "./app/types";

export function App(): JSX.Element {
  const mainColumnRef = useRef<HTMLElement | null>(null);
  const webviewPanelRef = useRef<HTMLElement | null>(null);
  const projects = useWorkspaceStore((state) => state.projects);
  const sessionsByProject = useWorkspaceStore((state) => state.sessionsByProject);
  const gitStatusesByProject = useWorkspaceStore((state) => state.gitStatusesByProject);
  const defaultSessionProvider = useWorkspaceStore((state) => state.defaultSessionProvider);
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId);
  const activeSessionId = useWorkspaceStore((state) => state.activeSessionId);
  const webTargetText = useWorkspaceStore((state) => state.webTargetText);

  const serverError = useWorkspaceStore((state) => state.serverError);
  const serverTerminalsByProject = useWorkspaceStore((state) => state.serverTerminalsByProject);
  const sessionTerminalsBySessionId = useWorkspaceStore((state) => state.sessionTerminalsBySessionId);
  const sessionTabsByProject = useWorkspaceStore((state) => state.sessionTabsByProject);
  const activeTerminalTabByProject = useWorkspaceStore((state) => state.activeTerminalTabByProject);
  const shellTabsByProject = useWorkspaceStore((state) => state.shellTabsByProject);
  const shellTerminalsByTabId = useWorkspaceStore((state) => state.shellTerminalsByTabId);

  const showSessionProviderModal = useWorkspaceStore((state) => state.showSessionProviderModal);
  const rememberSessionProviderChoice = useWorkspaceStore((state) => state.rememberSessionProviderChoice);
  const showProviderOverrideMenu = useWorkspaceStore((state) => state.showProviderOverrideMenu);
  const showProjectModal = useWorkspaceStore((state) => state.showProjectModal);
  const editingProjectId = useWorkspaceStore((state) => state.editingProjectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const projectPath = useWorkspaceStore((state) => state.projectPath);
  const projectCommand = useWorkspaceStore((state) => state.projectCommand);
  const projectDefaultPort = useWorkspaceStore((state) => state.projectDefaultPort);
  const projectModalError = useWorkspaceStore((state) => state.projectModalError);
  const showSessionRenameModal = useWorkspaceStore((state) => state.showSessionRenameModal);
  const sessionTitleDraft = useWorkspaceStore((state) => state.sessionTitleDraft);
  const sessionRenameError = useWorkspaceStore((state) => state.sessionRenameError);

  const refreshProjects = useWorkspaceStore((state) => state.refreshProjects);
  const refreshLiveView = useWorkspaceStore((state) => state.refreshLiveView);
  const ensureSessionTabOpen = useWorkspaceStore((state) => state.ensureSessionTabOpen);
  const openSessionTerminal = useWorkspaceStore((state) => state.openSessionTerminal);
  const closeSessionTab = useWorkspaceStore((state) => state.closeSessionTab);
  const startServer = useWorkspaceStore((state) => state.startServer);
  const stopServer = useWorkspaceStore((state) => state.stopServer);
  const setActiveTerminalTab = useWorkspaceStore((state) => state.setActiveTerminalTab);
  const openRegularTerminal = useWorkspaceStore((state) => state.openRegularTerminal);
  const closeTerminalTabByKey = useWorkspaceStore((state) => state.closeTerminalTabByKey);
  const removeTerminalMappingsByTerminalId = useWorkspaceStore((state) => state.removeTerminalMappingsByTerminalId);
  const setActiveProjectId = useWorkspaceStore((state) => state.setActiveProjectId);
  const setActiveSessionId = useWorkspaceStore((state) => state.setActiveSessionId);
  const setWebTargetText = useWorkspaceStore((state) => state.setWebTargetText);
  const setRememberSessionProviderChoice = useWorkspaceStore((state) => state.setRememberSessionProviderChoice);
  const activateSession = useWorkspaceStore((state) => state.activateSession);
  const openCreateSessionFlow = useWorkspaceStore((state) => state.openCreateSessionFlow);
  const onProviderMenuOpenChange = useWorkspaceStore((state) => state.onProviderMenuOpenChange);
  const onCreateSessionWithProvider = useWorkspaceStore((state) => state.onCreateSessionWithProvider);
  const onClearDefaultProvider = useWorkspaceStore((state) => state.onClearDefaultProvider);
  const onSelectProvider = useWorkspaceStore((state) => state.onSelectProvider);
  const closeProviderModal = useWorkspaceStore((state) => state.closeProviderModal);
  const openCreateProject = useWorkspaceStore((state) => state.openCreateProject);
  const openEditProject = useWorkspaceStore((state) => state.openEditProject);
  const closeProjectModal = useWorkspaceStore((state) => state.closeProjectModal);
  const submitProject = useWorkspaceStore((state) => state.submitProject);
  const setProjectName = useWorkspaceStore((state) => state.setProjectName);
  const setProjectPath = useWorkspaceStore((state) => state.setProjectPath);
  const setProjectCommand = useWorkspaceStore((state) => state.setProjectCommand);
  const setProjectDefaultPort = useWorkspaceStore((state) => state.setProjectDefaultPort);
  const openRenameSession = useWorkspaceStore((state) => state.openRenameSession);
  const closeRenameModal = useWorkspaceStore((state) => state.closeRenameModal);
  const submitSessionRename = useWorkspaceStore((state) => state.submitSessionRename);
  const setSessionTitleDraft = useWorkspaceStore((state) => state.setSessionTitleDraft);
  const deleteProject = useWorkspaceStore((state) => state.deleteProject);
  const deleteSession = useWorkspaceStore((state) => state.deleteSession);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const activeWorkspace = useMemo(
    () =>
      selectActiveWorkspace({
        projects,
        sessionsByProject,
        activeProjectId,
        gitStatusesByProject,
        serverTerminalsByProject,
        activeTerminalTabByProject,
        sessionTerminalsBySessionId,
        shellTerminalsByTabId
      }),
    [
      projects,
      sessionsByProject,
      activeProjectId,
      gitStatusesByProject,
      serverTerminalsByProject,
      activeTerminalTabByProject,
      sessionTerminalsBySessionId,
      shellTerminalsByTabId
    ]
  );

  const terminalTabs = useMemo(
    () =>
      selectTerminalTabs({
        activeProjectId,
        activeSessions: activeWorkspace.activeSessions,
        sessionTabsByProject,
        serverTerminalsByProject,
        shellTabsByProject,
        shellTerminalsByTabId
      }),
    [activeProjectId, activeWorkspace.activeSessions, sessionTabsByProject, serverTerminalsByProject, shellTabsByProject, shellTerminalsByTabId]
  );

  const hasBlockingModal = showProjectModal || showSessionProviderModal || showSessionRenameModal;

  const { previewSplitPercent, onSplitterMouseDown } = usePreviewSplit({
    isServerRunning: activeWorkspace.isServerRunning,
    mainColumnRef
  });

  useWebviewController({
    projects,
    activeProjectId,
    isServerRunning: activeWorkspace.isServerRunning,
    hasBlockingModal,
    webviewPanelRef,
    setActiveProjectId,
    setActiveSessionId,
    setWebTargetText,
    removeTerminalMappingsByTerminalId
  });

  useInitialSessionOpen({
    projects,
    sessionsByProject,
    activeProjectId,
    activeSessionId,
    ensureSessionTabOpen,
    openSessionTerminal
  });

  const onDeleteProject = useCallback(
    (projectId: string): void => {
      void deleteProject(projectId);
    },
    [deleteProject]
  );

  const onDeleteSession = useCallback(
    (projectId: string, sessionId: string): void => {
      void deleteSession(projectId, sessionId);
    },
    [deleteSession]
  );

  const onSelectTerminalTab = useCallback(
    (tabKey: string): void => {
      if (!activeProjectId) {
        return;
      }
      setActiveTerminalTab(activeProjectId, tabKey);
    },
    [activeProjectId, setActiveTerminalTab]
  );

  const onCloseSessionTab = useCallback(
    (sessionId: string): void => {
      if (!activeProjectId) {
        return;
      }
      void closeSessionTab(activeProjectId, sessionId);
    },
    [activeProjectId, closeSessionTab]
  );

  const onCloseTerminalTab = useCallback(
    (tabKey: string): void => {
      if (!activeProjectId) {
        return;
      }
      void closeTerminalTabByKey(activeProjectId, tabKey);
    },
    [activeProjectId, closeTerminalTabByKey]
  );

  const sidebarModel: ProjectSidebarModel = {
    projects,
    sessionsByProject,
    activeProjectId,
    activeSessionId,
    serverTerminalsByProject,
    defaultSessionProvider,
    showProviderOverrideMenu
  };

  const sidebarActions: ProjectSidebarActions = {
    onShowCreateProject: openCreateProject,
    onSelectProject: setActiveProjectId,
    onEditProject: openEditProject,
    onDeleteProject,
    onToggleServer: (projectId, running) => {
      void (running ? stopServer(projectId) : startServer(projectId));
    },
    onActivateSession: (projectId, sessionId) => {
      void activateSession(projectId, sessionId);
    },
    onRenameSession: openRenameSession,
    onDeleteSession,
    onOpenRegularTerminal: (projectId) => {
      void openRegularTerminal(projectId);
    },
    onOpenCreateSessionFlow: (projectId) => {
      void openCreateSessionFlow(projectId);
    },
    onProviderMenuOpenChange,
    onCreateSessionWithProvider,
    onClearDefaultProvider
  };

  const workspaceModel: WorkspacePanelModel = {
    isServerRunning: activeWorkspace.isServerRunning,
    previewSplitPercent,
    webTargetText,
    serverError,
    terminalTabs,
    activeTerminalTabKey: activeWorkspace.activeTerminalTabKey,
    activeProjectId,
    activeTerminalId: activeWorkspace.activeTerminalId
  };

  const workspaceActions: WorkspacePanelActions = {
    onSelectTerminalTab,
    onCloseSessionTab,
    onCloseTerminalTab,
    onSplitterMouseDown
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isRefreshShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r";
      if (!isRefreshShortcut) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest(".terminal-host, .xterm") || target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
          return;
        }
      }

      if (!activeWorkspace.isServerRunning || !webTargetText.startsWith("http://localhost:")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void refreshLiveView().catch(() => {
        // Ignore transient navigation errors; next server event will recover.
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeWorkspace.isServerRunning, refreshLiveView, webTargetText]);

  return (
    <div className="window-root">
      <WindowBar
        activeProjectName={activeWorkspace.activeProject ? activeWorkspace.activeProject.name : "No Active Project"}
        gitStatus={activeWorkspace.activeProjectGitStatus}
      />
      <div className="app-shell">
        <ProjectSidebar model={sidebarModel} actions={sidebarActions} />

        <WorkspacePanel
          mainColumnRef={mainColumnRef}
          webviewPanelRef={webviewPanelRef}
          model={workspaceModel}
          actions={workspaceActions}
        />
      </div>

      {showProjectModal ? (
        <ProjectModal
          editingProjectId={editingProjectId}
          projectModalError={projectModalError}
          projectName={projectName}
          projectPath={projectPath}
          projectCommand={projectCommand}
          projectDefaultPort={projectDefaultPort}
          setProjectName={setProjectName}
          setProjectPath={setProjectPath}
          setProjectCommand={setProjectCommand}
          setProjectDefaultPort={setProjectDefaultPort}
          onClose={closeProjectModal}
          onSubmit={() => {
            void submitProject();
          }}
        />
      ) : null}

      {showSessionProviderModal ? (
        <SessionProviderModal
          rememberSessionProviderChoice={rememberSessionProviderChoice}
          setRememberSessionProviderChoice={setRememberSessionProviderChoice}
          onSelectClaude={() => onSelectProvider("claude")}
          onSelectCodex={() => onSelectProvider("codex")}
          onClose={closeProviderModal}
        />
      ) : null}

      {showSessionRenameModal ? (
        <SessionRenameModal
          title={sessionTitleDraft}
          error={sessionRenameError}
          setTitle={setSessionTitleDraft}
          onClose={closeRenameModal}
          onSubmit={submitSessionRename}
        />
      ) : null}
    </div>
  );
}

