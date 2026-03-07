import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { WindowBar } from "./components/WindowBar";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { ProjectModal } from "./components/modals/ProjectModal";
import { SessionRenameModal } from "./components/modals/SessionRenameModal";
import { SessionProviderModal } from "./components/modals/SessionProviderModal";
import { useInitialSessionOpen } from "./app/hooks/useInitialSessionOpen";
import { useWebviewController } from "./app/hooks/useWebviewController";
import { selectActiveWorkspace, selectTerminalTabs } from "./app/selectors";
import { useWorkspaceStore } from "./app/store";
import type { ProjectSidebarActions, ProjectSidebarModel, WorkspacePanelActions, WorkspacePanelModel } from "./app/types";

export function App(): JSX.Element {
  const mainColumnRef = useRef<HTMLElement | null>(null);
  const webviewPanelRef = useRef<HTMLElement | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"terminal" | "live">("terminal");
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
  const showTerminalRenameModal = useWorkspaceStore((state) => state.showTerminalRenameModal);
  const terminalTitleDraft = useWorkspaceStore((state) => state.terminalTitleDraft);
  const terminalRenameError = useWorkspaceStore((state) => state.terminalRenameError);

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
  const removeServerTerminalMappingByTerminalId = useWorkspaceStore((state) => state.removeServerTerminalMappingByTerminalId);
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
  const openRenameTerminal = useWorkspaceStore((state) => state.openRenameTerminal);
  const closeTerminalRenameModal = useWorkspaceStore((state) => state.closeTerminalRenameModal);
  const submitTerminalRename = useWorkspaceStore((state) => state.submitTerminalRename);
  const setTerminalTitleDraft = useWorkspaceStore((state) => state.setTerminalTitleDraft);
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

  const hasBlockingModal = showProjectModal || showSessionProviderModal || showSessionRenameModal || showTerminalRenameModal;

  useWebviewController({
    projects,
    activeProjectId,
    isServerRunning: activeWorkspace.isServerRunning,
    isLiveViewActive: workspaceView === "live",
    hasBlockingModal,
    webviewPanelRef,
    setActiveProjectId,
    setActiveSessionId,
    setWebTargetText,
    removeServerTerminalMappingByTerminalId
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
    activeTerminalTabKey: activeWorkspace.activeTerminalTabKey,
    serverTerminalsByProject,
    shellTabsByProject,
    shellTerminalsByTabId,
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
    onActivateTerminalTab: (projectId, tabKey) => {
      setActiveProjectId(projectId);
      setActiveTerminalTab(projectId, tabKey);
    },
    onRenameSession: openRenameSession,
    onRenameTerminal: (projectId, tabKey) => {
      openRenameTerminal(projectId, tabKey);
    },
    onDeleteSession,
    onCloseTerminalTab: (projectId, tabKey) => {
      void closeTerminalTabByKey(projectId, tabKey);
    },
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

  const activeSession = useMemo((): import("./app/types").WorkspacePanelModel["activeSession"] => {
    const tabKey = activeWorkspace.activeTerminalTabKey;
    if (!tabKey?.startsWith("session:") || !activeProjectId) {
      return null;
    }
    const sessionId = tabKey.slice("session:".length);
    return (sessionsByProject[activeProjectId] ?? []).find((s) => s.id === sessionId) ?? null;
  }, [activeWorkspace.activeTerminalTabKey, activeProjectId, sessionsByProject]);

  useEffect(() => {
    if (!activeWorkspace.isServerRunning && workspaceView === "live") {
      setWorkspaceView("terminal");
    }
  }, [activeWorkspace.isServerRunning, workspaceView]);

  const workspaceModel: WorkspacePanelModel = {
    isServerRunning: activeWorkspace.isServerRunning,
    workspaceView,
    webTargetText,
    serverError,
    terminalTabs,
    activeTerminalTabKey: activeWorkspace.activeTerminalTabKey,
    activeProjectId,
    activeTerminalId: activeWorkspace.activeTerminalId,
    activeSession
  };

  const workspaceActions: WorkspacePanelActions = {
    onSelectTerminalTab,
    onCloseSessionTab,
    onCloseTerminalTab,
    onSelectWorkspaceView: setWorkspaceView
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest(".terminal-host, .xterm") || target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
          return;
        }
      }

      const isModifier = event.ctrlKey || event.metaKey;
      if (isModifier && event.key === "1") {
        event.preventDefault();
        event.stopPropagation();
        setWorkspaceView("terminal");
        return;
      }
      if (isModifier && event.key === "2") {
        if (!activeWorkspace.isServerRunning) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setWorkspaceView("live");
        return;
      }

      const isRefreshShortcut = isModifier && event.key.toLowerCase() === "r";
      if (!isRefreshShortcut) {
        return;
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
          onSelectOpenCode={() => onSelectProvider("opencode")}
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

      {showTerminalRenameModal ? (
        <SessionRenameModal
          title={terminalTitleDraft}
          error={terminalRenameError}
          setTitle={setTerminalTitleDraft}
          onClose={closeTerminalRenameModal}
          onSubmit={submitTerminalRename}
          heading="Rename Terminal"
          description="Use a concise name so terminal tabs remain readable."
          inputLabel="Name"
          placeholder="Terminal"
        />
      ) : null}
    </div>
  );
}

