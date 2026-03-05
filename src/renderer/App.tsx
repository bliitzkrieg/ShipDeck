import { useCallback, useMemo, useRef, useState } from "react";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { WindowBar } from "./components/WindowBar";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { ProjectModal } from "./components/modals/ProjectModal";
import { SessionRenameModal } from "./components/modals/SessionRenameModal";
import { SessionProviderModal } from "./components/modals/SessionProviderModal";
import { useBootstrapData } from "./app/hooks/useBootstrapData";
import { useInitialSessionOpen } from "./app/hooks/useInitialSessionOpen";
import { usePreviewSplit } from "./app/hooks/usePreviewSplit";
import { useProjectModalForm } from "./app/hooks/useProjectModalForm";
import { useSessionCoordinator } from "./app/hooks/useSessionCoordinator";
import { useSessionRenameForm } from "./app/hooks/useSessionRenameForm";
import { useTerminalCoordinator } from "./app/hooks/useTerminalCoordinator";
import { useWebviewController } from "./app/hooks/useWebviewController";
import { selectActiveWorkspace, selectTerminalTabs } from "./app/selectors";
import type { ProjectSidebarActions, ProjectSidebarModel, WorkspacePanelActions, WorkspacePanelModel } from "./app/types";

export function App(): JSX.Element {
  const mainColumnRef = useRef<HTMLElement | null>(null);
  const webviewPanelRef = useRef<HTMLElement | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [webTargetText, setWebTargetText] = useState("No active localhost target");

  activeProjectIdRef.current = activeProjectId;

  const {
    projects,
    sessionsByProject,
    gitStatusesByProject,
    defaultSessionProvider,
    setSessionsByProject,
    refreshProjects,
    refreshSessionsForProject,
    refreshPreferences
  } = useBootstrapData({
    activeProjectIdRef,
    setActiveProjectId,
    setActiveSessionId
  });

  const {
    serverError,
    serverTerminalsByProject,
    sessionTerminalsBySessionId,
    sessionTabsByProject,
    activeTerminalTabByProject,
    ensureSessionTabOpen,
    openSessionTerminal,
    closeSessionTab,
    startServer,
    stopServer,
    setActiveTerminalTab,
    removeTerminalMappingsByTerminalId
  } = useTerminalCoordinator({ projects, activeProjectId });

  const {
    showSessionProviderModal,
    rememberSessionProviderChoice,
    showProviderOverrideMenu,
    setRememberSessionProviderChoice,
    activateSession,
    openCreateSessionFlow,
    onProviderMenuOpenChange,
    onCreateSessionWithProvider,
    onClearDefaultProvider,
    onSelectProvider,
    closeProviderModal
  } = useSessionCoordinator({
    defaultSessionProvider,
    refreshPreferences,
    refreshSessionsForProject: async (projectId) => {
      await refreshSessionsForProject(projectId);
    },
    setActiveProjectId,
    setActiveSessionId,
    ensureSessionTabOpen,
    openSessionTerminal,
    sessionsByProject
  });

  const {
    showProjectModal,
    editingProjectId,
    projectName,
    projectPath,
    projectCommand,
    projectDefaultPort,
    projectModalError,
    setProjectName,
    setProjectPath,
    setProjectCommand,
    setProjectDefaultPort,
    openCreateProject,
    openEditProject,
    closeProjectModal,
    submitProject
  } = useProjectModalForm({ refreshProjects, setActiveProjectId });

  const {
    showSessionRenameModal,
    sessionTitleDraft,
    sessionRenameError,
    setSessionTitleDraft,
    openRenameSession,
    closeRenameModal,
    submitSessionRename
  } = useSessionRenameForm({ sessionsByProject, setSessionsByProject });

  const activeWorkspace = useMemo(
    () =>
      selectActiveWorkspace({
        projects,
        sessionsByProject,
        activeProjectId,
        gitStatusesByProject,
        serverTerminalsByProject,
        activeTerminalTabByProject,
        sessionTerminalsBySessionId
      }),
    [
      projects,
      sessionsByProject,
      activeProjectId,
      gitStatusesByProject,
      serverTerminalsByProject,
      activeTerminalTabByProject,
      sessionTerminalsBySessionId
    ]
  );

  const terminalTabs = useMemo(
    () =>
      selectTerminalTabs({
        activeProjectId,
        activeSessions: activeWorkspace.activeSessions,
        sessionTabsByProject,
        serverTerminalsByProject
      }),
    [activeProjectId, activeWorkspace.activeSessions, sessionTabsByProject, serverTerminalsByProject]
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
      void window.api.projects.delete({ projectId }).then(() => refreshProjects());
    },
    [refreshProjects]
  );

  const onDeleteSession = useCallback(
    (projectId: string, sessionId: string): void => {
      void window.api.sessions.delete({ sessionId }).then(() => refreshSessionsForProject(projectId));
    },
    [refreshSessionsForProject]
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
    onSplitterMouseDown
  };

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

