import type { Project, ProjectGitStatus, Session } from "../../shared/types";
import { makeSessionTabKey, parseSessionTabKey } from "../utils/sessionProvider";
import type {
  ActiveTerminalTabByProject,
  ActiveWorkspaceSelection,
  ServerTerminalsByProject,
  SessionTabsByProject,
  SessionTerminalsBySessionId,
  SessionsByProject,
  TerminalTabViewModel
} from "./types";

interface ActiveSelectionInput {
  projects: Project[];
  sessionsByProject: SessionsByProject;
  activeProjectId: string | null;
  gitStatusesByProject: Record<string, ProjectGitStatus | null>;
  serverTerminalsByProject: ServerTerminalsByProject;
  activeTerminalTabByProject: ActiveTerminalTabByProject;
  sessionTerminalsBySessionId: SessionTerminalsBySessionId;
  shellTerminalsByTabId: Record<string, { projectId: string; terminalId: string; label: string }>;
}

export function selectActiveWorkspace(input: ActiveSelectionInput): ActiveWorkspaceSelection {
  const {
    projects,
    sessionsByProject,
    activeProjectId,
    gitStatusesByProject,
    serverTerminalsByProject,
    activeTerminalTabByProject,
    sessionTerminalsBySessionId,
    shellTerminalsByTabId
  } = input;

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeSessions = activeProjectId ? (sessionsByProject[activeProjectId] ?? []) : [];
  const currentServerTerminalId = activeProjectId ? (serverTerminalsByProject[activeProjectId] ?? null) : null;
  const activeTerminalTabKey = activeProjectId ? (activeTerminalTabByProject[activeProjectId] ?? null) : null;
  const activeSessionTabId = activeTerminalTabKey ? parseSessionTabKey(activeTerminalTabKey) : null;
  const activeTerminalId =
    activeProjectId && activeTerminalTabKey === "server"
      ? (serverTerminalsByProject[activeProjectId] ?? null)
      : activeSessionTabId
        ? (sessionTerminalsBySessionId[activeSessionTabId] ?? null)
        : activeTerminalTabKey?.startsWith("shell:")
          ? (shellTerminalsByTabId[activeTerminalTabKey.slice(6)]?.terminalId ?? null)
          : null;

  return {
    activeProject,
    activeSessions,
    activeProjectGitStatus: activeProject ? (gitStatusesByProject[activeProject.id] ?? null) : null,
    isServerRunning: Boolean(currentServerTerminalId),
    activeTerminalTabKey,
    activeTerminalId
  };
}

export function selectTerminalTabs(input: {
  activeProjectId: string | null;
  activeSessions: Session[];
  sessionTabsByProject: SessionTabsByProject;
  serverTerminalsByProject: ServerTerminalsByProject;
  shellTabsByProject: Record<string, string[]>;
  shellTerminalsByTabId: Record<string, { projectId: string; terminalId: string; label: string }>;
}): TerminalTabViewModel[] {
  const { activeProjectId, activeSessions, sessionTabsByProject, serverTerminalsByProject, shellTabsByProject, shellTerminalsByTabId } = input;

  if (!activeProjectId) {
    return [];
  }

  const sessionTabIds = sessionTabsByProject[activeProjectId] ?? [];
  const sessionTabs = sessionTabIds
    .map((sessionId) => activeSessions.find((item) => item.id === sessionId))
    .filter((item): item is Session => Boolean(item))
    .map((session) => ({
      key: makeSessionTabKey(session.id),
      label: session.title,
      kind: "session" as const,
      sessionId: session.id,
      terminalId: null,
      provider: session.provider,
      closable: true
    }));

  const serverTab = serverTerminalsByProject[activeProjectId]
    ? ([
        {
          key: "server",
          label: "Server",
          kind: "server" as const,
          sessionId: null,
          terminalId: serverTerminalsByProject[activeProjectId] ?? null,
          closable: false
        }
      ] as TerminalTabViewModel[])
    : [];

  const shellTabs = (shellTabsByProject[activeProjectId] ?? [])
    .map((tabId) => {
      const shell = shellTerminalsByTabId[tabId];
      if (!shell) {
        return null;
      }
      return {
        key: `shell:${tabId}`,
        label: shell.label,
        kind: "shell" as const,
        sessionId: null,
        terminalId: shell.terminalId,
        closable: true
      };
    })
    .filter((item): item is TerminalTabViewModel => Boolean(item));

  return [...serverTab, ...sessionTabs, ...shellTabs];
}
