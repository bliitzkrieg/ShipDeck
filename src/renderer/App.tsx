import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project, ProjectGitStatus, Session, SessionProvider } from "../shared/types";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { WindowBar } from "./components/WindowBar";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { ProjectModal } from "./components/modals/ProjectModal";
import { SessionRenameModal } from "./components/modals/SessionRenameModal";
import { SessionProviderModal } from "./components/modals/SessionProviderModal";
import {
  generateCliSessionName,
  makeSessionTabKey,
  parseSessionTabKey,
  providerBootCommand,
  providerLabel,
  providerRenameCommand,
  providerResumeLaunchCommand
} from "./utils/sessionProvider";
import { loadClampedPercentFromStorage, saveToStorage } from "./utils/storage";

type SessionsByProject = Record<string, Session[]>;
type ServerTerminalsByProject = Record<string, string>;
type SessionTerminalsBySessionId = Record<string, string>;
type SessionTabsByProject = Record<string, string[]>;
type ActiveTerminalTabByProject = Record<string, string>;

type TerminalTab = {
  key: string;
  label: string;
  sessionId: string | null;
};

const terminalSplitStorageKey = "shipdeck.previewSplitPercent";

export function App(): JSX.Element {
  const mainColumnRef = useRef<HTMLElement | null>(null);
  const webviewPanelRef = useRef<HTMLElement | null>(null);
  const isDraggingSplitRef = useRef(false);
  const projectsRef = useRef<Project[]>([]);
  const activeProjectIdRef = useRef<string | null>(null);
  const didAutoOpenInitialSessionRef = useRef(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [sessionsByProject, setSessionsByProject] = useState<SessionsByProject>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [webTargetText, setWebTargetText] = useState("No active localhost target");
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverTerminalsByProject, setServerTerminalsByProject] = useState<ServerTerminalsByProject>({});
  const [sessionTerminalsBySessionId, setSessionTerminalsBySessionId] = useState<SessionTerminalsBySessionId>({});
  const [sessionTabsByProject, setSessionTabsByProject] = useState<SessionTabsByProject>({});
  const [activeTerminalTabByProject, setActiveTerminalTabByProject] = useState<ActiveTerminalTabByProject>({});
  const [gitStatusesByProject, setGitStatusesByProject] = useState<Record<string, ProjectGitStatus | null>>({});
  const [defaultSessionProvider, setDefaultSessionProvider] = useState<SessionProvider | null>(null);
  const [showSessionProviderModal, setShowSessionProviderModal] = useState(false);
  const [showSessionRenameModal, setShowSessionRenameModal] = useState(false);
  const [sessionProviderProjectId, setSessionProviderProjectId] = useState<string | null>(null);
  const [rememberSessionProviderChoice, setRememberSessionProviderChoice] = useState(false);
  const [showProviderOverrideMenu, setShowProviderOverrideMenu] = useState<string | null>(null);
  const [sessionRenameProjectId, setSessionRenameProjectId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [sessionRenameError, setSessionRenameError] = useState<string | null>(null);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectCommand, setProjectCommand] = useState("pnpm dev");
  const [projectDefaultPort, setProjectDefaultPort] = useState("");
  const [projectModalError, setProjectModalError] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [previewSplitPercent, setPreviewSplitPercent] = useState<number>(() =>
    loadClampedPercentFromStorage(terminalSplitStorageKey, 56, 25, 75)
  );

  const activeProject = useMemo(() => projects.find((project) => project.id === activeProjectId) ?? null, [projects, activeProjectId]);
  const activeSessions = activeProjectId ? (sessionsByProject[activeProjectId] ?? []) : [];
  const currentServerTerminalId = activeProjectId ? (serverTerminalsByProject[activeProjectId] ?? null) : null;
  const activeTerminalTabKey = activeProjectId ? (activeTerminalTabByProject[activeProjectId] ?? null) : null;
  const activeSessionTabId = activeTerminalTabKey ? parseSessionTabKey(activeTerminalTabKey) : null;
  const activeTerminalId =
    activeProjectId && activeTerminalTabKey === "server"
      ? (serverTerminalsByProject[activeProjectId] ?? null)
      : activeSessionTabId
        ? (sessionTerminalsBySessionId[activeSessionTabId] ?? null)
        : null;
  const isServerRunning = Boolean(currentServerTerminalId);
  const activeProjectGitStatus = activeProject ? (gitStatusesByProject[activeProject.id] ?? null) : null;
  const hasBlockingModal = showProjectModal || showSessionProviderModal || showSessionRenameModal;

  const refreshGitStatuses = useCallback(async (): Promise<void> => {
    setGitStatusesByProject(await window.api.projects.gitStatuses());
  }, []);

  const refreshPreferences = useCallback(async (): Promise<void> => {
    const prefs = await window.api.preferences.get();
    setDefaultSessionProvider(prefs.defaultSessionProvider);
  }, []);

  const refreshSessionsForProject = useCallback(async (projectId: string): Promise<Session[]> => {
    const sessions = await window.api.sessions.list({ projectId });
    setSessionsByProject((prev) => ({ ...prev, [projectId]: sessions }));
    return sessions;
  }, []);

  const refreshProjects = useCallback(async (): Promise<void> => {
    const allProjects = await window.api.projects.list();
    setProjects(allProjects);
    await refreshGitStatuses();
    await refreshPreferences();
    const grouped: SessionsByProject = {};
    for (const project of allProjects) {
      grouped[project.id] = await window.api.sessions.list({ projectId: project.id });
    }
    setSessionsByProject(grouped);
    if (!activeProjectIdRef.current && allProjects[0]) {
      setActiveProjectId(allProjects[0].id);
      const first = grouped[allProjects[0].id] ?? [];
      if (first[0]) {
        setActiveSessionId(first[0].id);
        await window.api.context.activateSession({ sessionId: first[0].id });
      }
    }
  }, [refreshGitStatuses, refreshPreferences]);

  const queueTerminalCommand = useCallback(
    (terminalId: string, command: string, options?: { delayMs?: number; attempts?: number; intervalMs?: number }): void => {
      const delayMs = options?.delayMs ?? 900;
      const attempts = options?.attempts ?? 1;
      const intervalMs = options?.intervalMs ?? 700;
      for (let i = 0; i < attempts; i += 1) {
        window.setTimeout(() => {
          void window.api.terminals.write({ terminalId, data: command });
          window.setTimeout(() => {
            void window.api.terminals.write({ terminalId, data: "\r" });
          }, 40);
        }, delayMs + i * intervalMs);
      }
    },
    []
  );

  const ensureSessionTabOpen = useCallback((projectId: string, sessionId: string): void => {
    setSessionTabsByProject((prev) => {
      const current = prev[projectId] ?? [];
      if (current.includes(sessionId)) {
        return prev;
      }
      return { ...prev, [projectId]: [...current, sessionId] };
    });
    setActiveTerminalTabByProject((prev) => ({ ...prev, [projectId]: makeSessionTabKey(sessionId) }));
  }, []);

  const openSessionTerminal = useCallback(
    async (session: Session, mode: "create" | "restore"): Promise<void> => {
      if (sessionTerminalsBySessionId[session.id]) {
        return;
      }
      const project = projects.find((item) => item.id === session.projectId);
      if (!project) {
        return;
      }
      const terminal = await window.api.terminals.create({
        projectId: project.id,
        name: `${providerLabel(session.provider)} Session`,
        kind: "shell"
      });
      await window.api.terminals.open({
        terminalId: terminal.id,
        projectId: project.id,
        cwd: project.rootPath,
        kind: "shell",
        command:
          mode === "create"
            ? providerBootCommand(session.provider)
            : providerResumeLaunchCommand(session.provider, session.cliSessionName)
      });
      setSessionTerminalsBySessionId((prev) => ({ ...prev, [session.id]: terminal.id }));
      if (mode === "create") {
        queueTerminalCommand(terminal.id, providerRenameCommand(session.provider, session.cliSessionName), {
          delayMs: 1200,
          attempts: 1
        });
      }
    },
    [projects, queueTerminalCommand, sessionTerminalsBySessionId]
  );

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    const unsubContext = window.api.context.onChanged((payload) => {
      setActiveProjectId(payload.project.id);
      setActiveSessionId(payload.session.id);
      setWebTargetText(payload.webTarget ? `http://localhost:${payload.webTarget.port}${payload.webTarget.path}` : "No active localhost target");
    });
    const unsubPort = window.api.server.onPortDetected((payload) => {
      if (payload.projectId !== activeProjectId) {
        return;
      }
      const selectedProject = projectsRef.current.find((project) => project.id === payload.projectId) ?? null;
      const resolvedPort = selectedProject?.defaultPort ?? payload.port;
      setWebTargetText(`http://localhost:${resolvedPort}/`);
    });
    const unsubExit = window.api.terminals.onExit(({ terminalId }) => {
      setServerTerminalsByProject((prev) => {
        const next = { ...prev };
        for (const [projectId, value] of Object.entries(prev)) {
          if (value === terminalId) {
            delete next[projectId];
          }
        }
        return next;
      });
      setSessionTerminalsBySessionId((prev) => {
        const next = { ...prev };
        for (const [sessionId, value] of Object.entries(prev)) {
          if (value === terminalId) {
            delete next[sessionId];
          }
        }
        return next;
      });
    });
    return () => {
      unsubContext();
      unsubPort();
      unsubExit();
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!isServerRunning) {
      return;
    }
    const updateBounds = (): void => {
      const target = webviewPanelRef.current;
      if (!target) {
        return;
      }
      const rect = target.getBoundingClientRect();
      void window.api.webView.setBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      });
    };
    updateBounds();
    const resizeObserver = new ResizeObserver(() => updateBounds());
    if (webviewPanelRef.current) {
      resizeObserver.observe(webviewPanelRef.current);
    }
    window.addEventListener("resize", updateBounds);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [isServerRunning]);

  useEffect(() => {
    void window.api.webView.setVisible({ visible: isServerRunning && !hasBlockingModal });
  }, [hasBlockingModal, isServerRunning]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      if (!isDraggingSplitRef.current || !isServerRunning || !mainColumnRef.current) {
        return;
      }
      const bounds = mainColumnRef.current.getBoundingClientRect();
      if (bounds.height <= 0) {
        return;
      }
      const nextPercent = ((event.clientY - bounds.top) / bounds.height) * 100;
      setPreviewSplitPercent(Math.max(25, Math.min(75, nextPercent)));
    };
    const onMouseUp = (): void => {
      isDraggingSplitRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isServerRunning]);

  useEffect(() => {
    saveToStorage(terminalSplitStorageKey, String(previewSplitPercent));
  }, [previewSplitPercent]);

  useEffect(() => {
    if (didAutoOpenInitialSessionRef.current) {
      return;
    }
    const firstProject = projects[0];
    if (!firstProject || activeProjectId !== firstProject.id) {
      return;
    }
    const firstSession = (sessionsByProject[firstProject.id] ?? [])[0];
    if (!firstSession || activeSessionId !== firstSession.id) {
      return;
    }
    didAutoOpenInitialSessionRef.current = true;
    ensureSessionTabOpen(firstProject.id, firstSession.id);
    void openSessionTerminal(firstSession, "restore");
  }, [
    activeProjectId,
    activeSessionId,
    ensureSessionTabOpen,
    openSessionTerminal,
    projects,
    sessionsByProject
  ]);

  const saveProject = useCallback(async (): Promise<void> => {
    if (!projectName || !projectPath || !projectCommand) {
      setProjectModalError("Name, root path, and dev command are required.");
      return;
    }
    let defaultPort: number | null = null;
    if (projectDefaultPort.trim()) {
      const parsed = Number(projectDefaultPort);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        setProjectModalError("Default port must be between 1 and 65535.");
        return;
      }
      defaultPort = parsed;
    }
    const savedProject = editingProjectId
      ? await window.api.projects.update({
          projectId: editingProjectId,
          name: projectName,
          rootPath: projectPath,
          devCommand: projectCommand,
          defaultPort
        })
      : await window.api.projects.create({ name: projectName, rootPath: projectPath, devCommand: projectCommand, defaultPort });
    setShowProjectModal(false);
    setEditingProjectId(null);
    setProjectModalError(null);
    await refreshProjects();
    setActiveProjectId(savedProject.id);
  }, [editingProjectId, projectCommand, projectDefaultPort, projectName, projectPath, refreshProjects]);

  const createSession = useCallback(
    async (projectId: string, provider: SessionProvider): Promise<void> => {
      const created = await window.api.sessions.create({
        projectId,
        provider,
        cliSessionName: generateCliSessionName(provider),
        title: `${providerLabel(provider)} ${new Date().toLocaleTimeString()}`
      });
      await refreshSessionsForProject(projectId);
      setActiveProjectId(projectId);
      setActiveSessionId(created.id);
      await window.api.context.activateSession({ sessionId: created.id });
      ensureSessionTabOpen(projectId, created.id);
      await openSessionTerminal(created, "create");
    },
    [ensureSessionTabOpen, openSessionTerminal, refreshSessionsForProject]
  );

  const activateSession = useCallback(
    async (projectId: string, sessionId: string): Promise<void> => {
      setActiveProjectId(projectId);
      setActiveSessionId(sessionId);
      await window.api.context.activateSession({ sessionId });
      ensureSessionTabOpen(projectId, sessionId);
      const session = (sessionsByProject[projectId] ?? []).find((item) => item.id === sessionId);
      if (session) {
        await openSessionTerminal(session, "restore");
      }
    },
    [ensureSessionTabOpen, openSessionTerminal, sessionsByProject]
  );

  const closeSessionTab = useCallback(
    async (projectId: string, sessionId: string): Promise<void> => {
      const terminalId = sessionTerminalsBySessionId[sessionId];
      if (terminalId) {
        await window.api.terminals.kill({ terminalId });
      }
      setSessionTerminalsBySessionId((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      setSessionTabsByProject((prev) => {
        const next = { ...prev };
        const current = next[projectId] ?? [];
        next[projectId] = current.filter((id) => id !== sessionId);
        return next;
      });
      setActiveTerminalTabByProject((prev) => {
        const next = { ...prev };
        if (next[projectId] === makeSessionTabKey(sessionId)) {
          next[projectId] = serverTerminalsByProject[projectId] ? "server" : "";
        }
        return next;
      });
    },
    [serverTerminalsByProject, sessionTerminalsBySessionId]
  );

  const startServer = useCallback(
    async (projectId: string | null = activeProjectId): Promise<void> => {
      if (!projectId) {
        return;
      }
      setServerError(null);
      try {
        const result = await window.api.server.start({ projectId });
        setServerTerminalsByProject((prev) => ({ ...prev, [projectId]: result.terminalId }));
        setActiveTerminalTabByProject((prev) => ({ ...prev, [projectId]: "server" }));
      } catch (error) {
        setServerError(error instanceof Error ? error.message : String(error));
      }
    },
    [activeProjectId]
  );

  const stopServer = useCallback(
    async (projectId: string | null = activeProjectId): Promise<void> => {
      if (!projectId) {
        return;
      }
      const terminalId = serverTerminalsByProject[projectId];
      if (!terminalId) {
        return;
      }
      await window.api.terminals.kill({ terminalId });
      setServerTerminalsByProject((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
    },
    [activeProjectId, serverTerminalsByProject]
  );

  const openCreateSessionFlow = useCallback(
    async (projectId: string): Promise<void> => {
      if (defaultSessionProvider) {
        await createSession(projectId, defaultSessionProvider);
        return;
      }
      setSessionProviderProjectId(projectId);
      setRememberSessionProviderChoice(false);
      setShowSessionProviderModal(true);
    },
    [createSession, defaultSessionProvider]
  );

  const onShowCreateProject = useCallback(() => {
    setShowProjectModal(true);
    setEditingProjectId(null);
    setProjectModalError(null);
    setProjectName("");
    setProjectPath("");
    setProjectCommand("pnpm dev");
    setProjectDefaultPort("");
  }, []);

  const onEditProject = useCallback((project: Project) => {
    setEditingProjectId(project.id);
    setProjectName(project.name);
    setProjectPath(project.rootPath);
    setProjectCommand(project.devCommand);
    setProjectDefaultPort(project.defaultPort ? String(project.defaultPort) : "");
    setProjectModalError(null);
    setShowProjectModal(true);
  }, []);

  const onDeleteProject = useCallback(
    (projectId: string) => {
      void window.api.projects.delete({ projectId }).then(() => refreshProjects());
    },
    [refreshProjects]
  );

  const onDeleteSession = useCallback(
    (projectId: string, sessionId: string) => {
      void window.api.sessions.delete({ sessionId }).then(() => refreshSessionsForProject(projectId));
    },
    [refreshSessionsForProject]
  );

  const onRenameSession = useCallback((projectId: string, session: Session): void => {
    setSessionRenameProjectId(projectId);
    setEditingSessionId(session.id);
    setSessionTitleDraft(session.title);
    setSessionRenameError(null);
    setShowSessionRenameModal(true);
  }, []);

  const submitSessionRename = useCallback((): void => {
    if (!sessionRenameProjectId || !editingSessionId) {
      return;
    }
    const nextTitle = sessionTitleDraft.trim();
    if (!nextTitle) {
      setSessionRenameError("Session title is required.");
      return;
    }
    const current = (sessionsByProject[sessionRenameProjectId] ?? []).find((session) => session.id === editingSessionId);
    if (!current) {
      setSessionRenameError("Session no longer exists.");
      return;
    }
    if (nextTitle === current.title) {
      setShowSessionRenameModal(false);
      setSessionRenameError(null);
      return;
    }
    void window.api.sessions.rename({ sessionId: editingSessionId, title: nextTitle }).then((renamed) => {
      setSessionsByProject((prev) => ({
        ...prev,
        [sessionRenameProjectId]: (prev[sessionRenameProjectId] ?? []).map((item) => (item.id === renamed.id ? renamed : item))
      }));
      setShowSessionRenameModal(false);
      setSessionRenameError(null);
    });
  }, [editingSessionId, sessionRenameProjectId, sessionTitleDraft, sessionsByProject]);

  const onSelectTerminalTab = useCallback(
    (tabKey: string) => {
      if (!activeProjectId) {
        return;
      }
      setActiveTerminalTabByProject((prev) => ({ ...prev, [activeProjectId]: tabKey }));
    },
    [activeProjectId]
  );

  const onCloseSessionTab = useCallback(
    (sessionId: string) => {
      if (!activeProjectId) {
        return;
      }
      void closeSessionTab(activeProjectId, sessionId);
    },
    [activeProjectId, closeSessionTab]
  );

  const onSplitterMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isDraggingSplitRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onProviderMenuOpenChange = useCallback((projectId: string, open: boolean): void => {
    setShowProviderOverrideMenu(open ? projectId : null);
  }, []);

  const onCreateSessionWithProvider = useCallback(
    (projectId: string, provider: SessionProvider): void => {
      setShowProviderOverrideMenu(null);
      void createSession(projectId, provider);
    },
    [createSession]
  );

  const onClearDefaultProvider = useCallback((): void => {
    setShowProviderOverrideMenu(null);
    void window.api.preferences.setDefaultSessionProvider({ provider: null }).then(() => refreshPreferences());
  }, [refreshPreferences]);

  const activeProjectTabs = activeProjectId ? (sessionTabsByProject[activeProjectId] ?? []) : [];
  const terminalTabs: TerminalTab[] = activeProjectId
    ? [
        ...(serverTerminalsByProject[activeProjectId]
          ? [{ key: "server", label: "Server", sessionId: null as string | null }]
          : []),
        ...activeProjectTabs
          .map((sessionId) => activeSessions.find((item) => item.id === sessionId))
          .filter((item): item is Session => Boolean(item))
          .map((session) => ({ key: makeSessionTabKey(session.id), label: session.title, sessionId: session.id }))
      ]
    : [];

  return (
    <div className="window-root">
      <WindowBar activeProjectName={activeProject ? activeProject.name : "No Active Project"} gitStatus={activeProjectGitStatus} />
      <div className="app-shell">
        <ProjectSidebar
          projects={projects}
          sessionsByProject={sessionsByProject}
          activeProjectId={activeProjectId}
          activeSessionId={activeSessionId}
          serverTerminalsByProject={serverTerminalsByProject}
          defaultSessionProvider={defaultSessionProvider}
          showProviderOverrideMenu={showProviderOverrideMenu}
          onShowCreateProject={onShowCreateProject}
          onSelectProject={setActiveProjectId}
          onEditProject={onEditProject}
          onDeleteProject={onDeleteProject}
          onToggleServer={(projectId, running) => {
            void (running ? stopServer(projectId) : startServer(projectId));
          }}
          onActivateSession={(projectId, sessionId) => {
            void activateSession(projectId, sessionId);
          }}
          onRenameSession={onRenameSession}
          onDeleteSession={onDeleteSession}
          onOpenCreateSessionFlow={(projectId) => {
            void openCreateSessionFlow(projectId);
          }}
          onProviderMenuOpenChange={onProviderMenuOpenChange}
          onCreateSessionWithProvider={onCreateSessionWithProvider}
          onClearDefaultProvider={onClearDefaultProvider}
        />

        <WorkspacePanel
          mainColumnRef={mainColumnRef}
          webviewPanelRef={webviewPanelRef}
          isServerRunning={isServerRunning}
          previewSplitPercent={previewSplitPercent}
          webTargetText={webTargetText}
          serverError={serverError}
          terminalTabs={terminalTabs}
          activeTerminalTabKey={activeTerminalTabKey}
          activeProjectId={activeProjectId}
          activeTerminalId={activeTerminalId}
          onSelectTerminalTab={onSelectTerminalTab}
          onCloseSessionTab={onCloseSessionTab}
          onSplitterMouseDown={onSplitterMouseDown}
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
          onClose={() => setShowProjectModal(false)}
          onSubmit={() => {
            void saveProject();
          }}
        />
      ) : null}

      {showSessionProviderModal ? (
        <SessionProviderModal
          rememberSessionProviderChoice={rememberSessionProviderChoice}
          setRememberSessionProviderChoice={setRememberSessionProviderChoice}
          onSelectClaude={() => {
            if (!sessionProviderProjectId) {
              return;
            }
            if (rememberSessionProviderChoice) {
              void window.api.preferences.setDefaultSessionProvider({ provider: "claude" }).then(() => refreshPreferences());
            }
            setShowSessionProviderModal(false);
            void createSession(sessionProviderProjectId, "claude");
          }}
          onSelectCodex={() => {
            if (!sessionProviderProjectId) {
              return;
            }
            if (rememberSessionProviderChoice) {
              void window.api.preferences.setDefaultSessionProvider({ provider: "codex" }).then(() => refreshPreferences());
            }
            setShowSessionProviderModal(false);
            void createSession(sessionProviderProjectId, "codex");
          }}
          onClose={() => setShowSessionProviderModal(false)}
        />
      ) : null}

      {showSessionRenameModal ? (
        <SessionRenameModal
          title={sessionTitleDraft}
          error={sessionRenameError}
          setTitle={setSessionTitleDraft}
          onClose={() => {
            setShowSessionRenameModal(false);
            setSessionRenameError(null);
          }}
          onSubmit={submitSessionRename}
        />
      ) : null}
    </div>
  );
}
