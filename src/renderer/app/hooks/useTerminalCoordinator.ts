import { useCallback, useState } from "react";
import type { Project, Session } from "../../../shared/types";
import { makeSessionTabKey, parseSessionTabKey, providerBootCommand, providerLabel, providerRenameCommand, providerResumeLaunchCommand } from "../../utils/sessionProvider";
import type {
  ActiveTerminalTabByProject,
  ServerTerminalsByProject,
  SessionTabsByProject,
  SessionTerminalsBySessionId
} from "../types";

interface UseTerminalCoordinatorInput {
  projects: Project[];
  activeProjectId: string | null;
}

interface TerminalCoordinator {
  serverError: string | null;
  serverTerminalsByProject: ServerTerminalsByProject;
  sessionTerminalsBySessionId: SessionTerminalsBySessionId;
  sessionTabsByProject: SessionTabsByProject;
  activeTerminalTabByProject: ActiveTerminalTabByProject;
  ensureSessionTabOpen: (projectId: string, sessionId: string) => void;
  openSessionTerminal: (session: Session, mode: "create" | "restore") => Promise<void>;
  closeSessionTab: (projectId: string, sessionId: string) => Promise<void>;
  startServer: (projectId?: string | null) => Promise<void>;
  stopServer: (projectId?: string | null) => Promise<void>;
  setActiveTerminalTab: (projectId: string, tabKey: string) => void;
  removeTerminalMappingsByTerminalId: (terminalId: string) => void;
}

export function useTerminalCoordinator({ projects, activeProjectId }: UseTerminalCoordinatorInput): TerminalCoordinator {
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverTerminalsByProject, setServerTerminalsByProject] = useState<ServerTerminalsByProject>({});
  const [sessionTerminalsBySessionId, setSessionTerminalsBySessionId] = useState<SessionTerminalsBySessionId>({});
  const [sessionTabsByProject, setSessionTabsByProject] = useState<SessionTabsByProject>({});
  const [activeTerminalTabByProject, setActiveTerminalTabByProject] = useState<ActiveTerminalTabByProject>({});

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

  const setActiveTerminalTab = useCallback((projectId: string, tabKey: string): void => {
    const sessionId = parseSessionTabKey(tabKey);
    setActiveTerminalTabByProject((prev) => ({ ...prev, [projectId]: tabKey }));
    if (sessionId) {
      setSessionTabsByProject((prev) => {
        const current = prev[projectId] ?? [];
        if (current.includes(sessionId)) {
          return prev;
        }
        return { ...prev, [projectId]: [...current, sessionId] };
      });
    }
  }, []);

  const removeTerminalMappingsByTerminalId = useCallback((terminalId: string): void => {
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
  }, []);

  return {
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
  };
}
