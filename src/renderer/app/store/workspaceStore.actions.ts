import type { SessionProvider } from "../../../shared/types";
import { generateCliSessionName, makeSessionTabKey, parseSessionTabKey, providerBootCommand, providerLabel, providerRenameCommand, providerResumeLaunchCommand } from "../../utils/sessionProvider";
import type { SessionsByProject } from "../types";
import type { WorkspaceActions, WorkspaceGet, WorkspaceSet } from "./workspaceStore.types";

function queueTerminalCommand(terminalId: string, command: string, options?: { delayMs?: number; attempts?: number; intervalMs?: number }): void {
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
}

export function createWorkspaceActions(set: WorkspaceSet, get: WorkspaceGet): WorkspaceActions {
  const createSessionWithProvider = async (projectId: string, provider: SessionProvider): Promise<void> => {
    const created = await window.api.sessions.create({
      projectId,
      provider,
      cliSessionName: generateCliSessionName(provider),
      title: `${providerLabel(provider)} ${new Date().toLocaleTimeString()}`
    });
    await get().refreshSessionsForProject(projectId);
    set({ activeProjectId: projectId, activeSessionId: created.id });
    await window.api.context.activateSession({ sessionId: created.id });
    get().ensureSessionTabOpen(projectId, created.id);
    await get().openSessionTerminal(created, "create");
  };

  return {
    setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
    setActiveSessionId: (sessionId) => set({ activeSessionId: sessionId }),
    setWebTargetText: (value) => set({ webTargetText: value }),
    setRememberSessionProviderChoice: (value) => set({ rememberSessionProviderChoice: value }),
    setProjectName: (value) => set({ projectName: value }),
    setProjectPath: (value) => set({ projectPath: value }),
    setProjectCommand: (value) => set({ projectCommand: value }),
    setProjectDefaultPort: (value) => set({ projectDefaultPort: value }),
    setSessionTitleDraft: (value) => set({ sessionTitleDraft: value }),

    refreshGitStatuses: async () => {
      set({ gitStatusesByProject: await window.api.projects.gitStatuses() });
    },

    refreshPreferences: async () => {
      const prefs = await window.api.preferences.get();
      set({ defaultSessionProvider: prefs.defaultSessionProvider });
    },

    refreshSessionsForProject: async (projectId) => {
      const sessions = await window.api.sessions.list({ projectId });
      set((state) => ({ sessionsByProject: { ...state.sessionsByProject, [projectId]: sessions } }));
      return sessions;
    },

    refreshProjects: async () => {
      const prev = get();
      const allProjects = await window.api.projects.list();
      const grouped: SessionsByProject = {};
      for (const project of allProjects) {
        grouped[project.id] = await window.api.sessions.list({ projectId: project.id });
      }
      const gitStatusesByProject = await window.api.projects.gitStatuses();
      const prefs = await window.api.preferences.get();
      const shouldInitializeSelection = !prev.didInitializeSelection && !prev.activeProjectId && Boolean(allProjects[0]);
      const hasPreviousActiveProject = prev.activeProjectId
        ? allProjects.some((project) => project.id === prev.activeProjectId)
        : false;
      const resolvedActiveProjectId = shouldInitializeSelection
        ? allProjects[0].id
        : hasPreviousActiveProject
          ? prev.activeProjectId
          : (allProjects[0]?.id ?? null);

      set({
        projects: allProjects,
        sessionsByProject: grouped,
        gitStatusesByProject,
        defaultSessionProvider: prefs.defaultSessionProvider,
        activeProjectId: resolvedActiveProjectId,
        didInitializeSelection: prev.didInitializeSelection || shouldInitializeSelection || Boolean(resolvedActiveProjectId)
      });

      if (!shouldInitializeSelection) {
        return;
      }

      const firstSession = (grouped[allProjects[0].id] ?? [])[0];
      if (!firstSession) {
        return;
      }

      set({ activeSessionId: firstSession.id, activeProjectId: allProjects[0].id, didInitializeSelection: true });
      await window.api.context.activateSession({ sessionId: firstSession.id });
    },

    refreshLiveView: async () => {
      const target = get().webTargetText;
      if (!target.startsWith("http://localhost:")) {
        return;
      }
      await window.api.webView.loadTarget({ url: target });
    },

    ensureSessionTabOpen: (projectId, sessionId) => {
      set((state) => {
        const current = state.sessionTabsByProject[projectId] ?? [];
        const nextTabs = current.includes(sessionId) ? current : [...current, sessionId];
        return {
          sessionTabsByProject: { ...state.sessionTabsByProject, [projectId]: nextTabs },
          activeTerminalTabByProject: { ...state.activeTerminalTabByProject, [projectId]: makeSessionTabKey(sessionId) }
        };
      });
    },

    openSessionTerminal: async (session, mode) => {
      if (get().sessionTerminalsBySessionId[session.id]) {
        return;
      }
      const project = get().projects.find((item) => item.id === session.projectId);
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
      set((state) => ({ sessionTerminalsBySessionId: { ...state.sessionTerminalsBySessionId, [session.id]: terminal.id } }));
      if (mode === "create") {
        queueTerminalCommand(terminal.id, providerRenameCommand(session.provider, session.cliSessionName), {
          delayMs: 1200,
          attempts: 1
        });
      }
    },

    closeSessionTab: async (projectId, sessionId) => {
      const terminalId = get().sessionTerminalsBySessionId[sessionId];
      if (terminalId) {
        await window.api.terminals.kill({ terminalId });
      }
      set((state) => {
        const nextTerminals = { ...state.sessionTerminalsBySessionId };
        delete nextTerminals[sessionId];
        const projectTabs = (state.sessionTabsByProject[projectId] ?? []).filter((id) => id !== sessionId);
        const nextTabByProject = { ...state.activeTerminalTabByProject };
        if (nextTabByProject[projectId] === makeSessionTabKey(sessionId)) {
          nextTabByProject[projectId] = state.serverTerminalsByProject[projectId] ? "server" : "";
        }
        return {
          sessionTerminalsBySessionId: nextTerminals,
          sessionTabsByProject: { ...state.sessionTabsByProject, [projectId]: projectTabs },
          activeTerminalTabByProject: nextTabByProject
        };
      });
    },

    startServer: async (projectId = get().activeProjectId) => {
      if (!projectId) {
        return;
      }
      set({ serverError: null });
      try {
        const result = await window.api.server.start({ projectId });
        set((state) => ({
          serverTerminalsByProject: { ...state.serverTerminalsByProject, [projectId]: result.terminalId },
          activeTerminalTabByProject: { ...state.activeTerminalTabByProject, [projectId]: "server" }
        }));
      } catch (error) {
        set({ serverError: error instanceof Error ? error.message : String(error) });
      }
    },

    stopServer: async (projectId = get().activeProjectId) => {
      if (!projectId) {
        return;
      }
      const terminalId = get().serverTerminalsByProject[projectId];
      if (!terminalId) {
        return;
      }
      await window.api.terminals.kill({ terminalId });
      set((state) => {
        const next = { ...state.serverTerminalsByProject };
        delete next[projectId];
        return { serverTerminalsByProject: next };
      });
    },

    setActiveTerminalTab: (projectId, tabKey) => {
      const sessionId = parseSessionTabKey(tabKey);
      set((state) => {
        const nextSessionTabsByProject = { ...state.sessionTabsByProject };
        if (sessionId) {
          const current = nextSessionTabsByProject[projectId] ?? [];
          if (!current.includes(sessionId)) {
            nextSessionTabsByProject[projectId] = [...current, sessionId];
          }
        }
        return {
          activeTerminalTabByProject: { ...state.activeTerminalTabByProject, [projectId]: tabKey },
          sessionTabsByProject: nextSessionTabsByProject
        };
      });
    },

    removeTerminalMappingsByTerminalId: (terminalId) => {
      set((state) => {
        const nextServer = { ...state.serverTerminalsByProject };
        for (const [projectId, value] of Object.entries(state.serverTerminalsByProject)) {
          if (value === terminalId) {
            delete nextServer[projectId];
          }
        }

        const nextSession = { ...state.sessionTerminalsBySessionId };
        for (const [sessionId, value] of Object.entries(state.sessionTerminalsBySessionId)) {
          if (value === terminalId) {
            delete nextSession[sessionId];
          }
        }

        return {
          serverTerminalsByProject: nextServer,
          sessionTerminalsBySessionId: nextSession
        };
      });
    },

    activateSession: async (projectId, sessionId) => {
      set({ activeProjectId: projectId, activeSessionId: sessionId });
      await window.api.context.activateSession({ sessionId });
      get().ensureSessionTabOpen(projectId, sessionId);
      const session = (get().sessionsByProject[projectId] ?? []).find((item) => item.id === sessionId);
      if (session) {
        await get().openSessionTerminal(session, "restore");
      }
    },

    openCreateSessionFlow: async (projectId) => {
      const provider = get().defaultSessionProvider;
      if (provider) {
        await createSessionWithProvider(projectId, provider);
        return;
      }
      set({
        sessionProviderProjectId: projectId,
        rememberSessionProviderChoice: false,
        showSessionProviderModal: true
      });
    },

    onProviderMenuOpenChange: (projectId, open) => {
      set({ showProviderOverrideMenu: open ? projectId : null });
    },

    onCreateSessionWithProvider: (projectId, provider) => {
      set({ showProviderOverrideMenu: null });
      void createSessionWithProvider(projectId, provider);
    },

    onClearDefaultProvider: () => {
      set({ showProviderOverrideMenu: null });
      void window.api.preferences.setDefaultSessionProvider({ provider: null }).then(() => get().refreshPreferences());
    },

    onSelectProvider: (provider) => {
      const projectId = get().sessionProviderProjectId;
      if (!projectId) {
        return;
      }
      if (get().rememberSessionProviderChoice) {
        void window.api.preferences.setDefaultSessionProvider({ provider }).then(() => get().refreshPreferences());
      }
      set({ showSessionProviderModal: false });
      void createSessionWithProvider(projectId, provider);
    },

    closeProviderModal: () => set({ showSessionProviderModal: false }),

    openCreateProject: () =>
      set({
        showProjectModal: true,
        editingProjectId: null,
        projectModalError: null,
        projectName: "",
        projectPath: "",
        projectCommand: "pnpm dev",
        projectDefaultPort: ""
      }),

    openEditProject: (project) =>
      set({
        editingProjectId: project.id,
        projectName: project.name,
        projectPath: project.rootPath,
        projectCommand: project.devCommand,
        projectDefaultPort: project.defaultPort ? String(project.defaultPort) : "",
        projectModalError: null,
        showProjectModal: true
      }),

    closeProjectModal: () => set({ showProjectModal: false }),

    submitProject: async () => {
      const { projectName, projectPath, projectCommand, projectDefaultPort, editingProjectId } = get();
      if (!projectName || !projectPath || !projectCommand) {
        set({ projectModalError: "Name, root path, and dev command are required." });
        return;
      }

      let defaultPort: number | null = null;
      if (projectDefaultPort.trim()) {
        const parsed = Number(projectDefaultPort);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          set({ projectModalError: "Default port must be between 1 and 65535." });
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

      set({ showProjectModal: false, editingProjectId: null, projectModalError: null, activeProjectId: savedProject.id });
      await get().refreshProjects();
    },

    deleteProject: async (projectId) => {
      await window.api.projects.delete({ projectId });
      await get().refreshProjects();
    },

    deleteSession: async (projectId, sessionId) => {
      await window.api.sessions.delete({ sessionId });
      await get().refreshSessionsForProject(projectId);
    },

    openRenameSession: (projectId, session) =>
      set({
        sessionRenameProjectId: projectId,
        editingSessionId: session.id,
        sessionTitleDraft: session.title,
        sessionRenameError: null,
        showSessionRenameModal: true
      }),

    closeRenameModal: () => set({ showSessionRenameModal: false, sessionRenameError: null }),

    submitSessionRename: () => {
      const { sessionRenameProjectId, editingSessionId, sessionTitleDraft, sessionsByProject } = get();
      if (!sessionRenameProjectId || !editingSessionId) {
        return;
      }
      const nextTitle = sessionTitleDraft.trim();
      if (!nextTitle) {
        set({ sessionRenameError: "Session title is required." });
        return;
      }
      const current = (sessionsByProject[sessionRenameProjectId] ?? []).find((session) => session.id === editingSessionId);
      if (!current) {
        set({ sessionRenameError: "Session no longer exists." });
        return;
      }
      if (nextTitle === current.title) {
        set({ showSessionRenameModal: false, sessionRenameError: null });
        return;
      }
      void window.api.sessions.rename({ sessionId: editingSessionId, title: nextTitle }).then((renamed) => {
        set((state) => ({
          sessionsByProject: {
            ...state.sessionsByProject,
            [sessionRenameProjectId]: (state.sessionsByProject[sessionRenameProjectId] ?? []).map((item) =>
              item.id === renamed.id ? renamed : item
            )
          },
          showSessionRenameModal: false,
          sessionRenameError: null
        }));
      });
    }
  };
}
