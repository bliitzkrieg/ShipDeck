import { useEffect, useRef } from "react";
import type { Project, Session } from "../../../shared/types";
import type { SessionsByProject } from "../types";

interface UseInitialSessionOpenInput {
  projects: Project[];
  sessionsByProject: SessionsByProject;
  activeProjectId: string | null;
  activeSessionId: string | null;
  ensureSessionTabOpen: (projectId: string, sessionId: string) => void;
  openSessionTerminal: (session: Session, mode: "create" | "restore") => Promise<void>;
}

export function useInitialSessionOpen({
  projects,
  sessionsByProject,
  activeProjectId,
  activeSessionId,
  ensureSessionTabOpen,
  openSessionTerminal
}: UseInitialSessionOpenInput): void {
  const didAutoOpenInitialSessionRef = useRef(false);

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
  }, [activeProjectId, activeSessionId, ensureSessionTabOpen, openSessionTerminal, projects, sessionsByProject]);
}
