import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, ProjectGitStatus, Session, SessionProvider } from "../../../shared/types";
import type { SessionsByProject } from "../types";

interface UseBootstrapDataOptions {
  activeProjectIdRef: React.MutableRefObject<string | null>;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
}

interface BootstrapData {
  projects: Project[];
  sessionsByProject: SessionsByProject;
  gitStatusesByProject: Record<string, ProjectGitStatus | null>;
  defaultSessionProvider: SessionProvider | null;
  setSessionsByProject: React.Dispatch<React.SetStateAction<SessionsByProject>>;
  refreshProjects: () => Promise<void>;
  refreshSessionsForProject: (projectId: string) => Promise<Session[]>;
  refreshPreferences: () => Promise<void>;
}

export function useBootstrapData({
  activeProjectIdRef,
  setActiveProjectId,
  setActiveSessionId
}: UseBootstrapDataOptions): BootstrapData {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessionsByProject, setSessionsByProject] = useState<SessionsByProject>({});
  const [gitStatusesByProject, setGitStatusesByProject] = useState<Record<string, ProjectGitStatus | null>>(
    {}
  );
  const [defaultSessionProvider, setDefaultSessionProvider] = useState<SessionProvider | null>(null);
  const didInitializeSelectionRef = useRef(false);

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

    if (didInitializeSelectionRef.current || activeProjectIdRef.current || !allProjects[0]) {
      return;
    }

    didInitializeSelectionRef.current = true;
    setActiveProjectId(allProjects[0].id);
    const firstSession = (grouped[allProjects[0].id] ?? [])[0];
    if (!firstSession) {
      return;
    }

    setActiveSessionId(firstSession.id);
    await window.api.context.activateSession({ sessionId: firstSession.id });
  }, [activeProjectIdRef, refreshGitStatuses, refreshPreferences, setActiveProjectId, setActiveSessionId]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  return {
    projects,
    sessionsByProject,
    gitStatusesByProject,
    defaultSessionProvider,
    setSessionsByProject,
    refreshProjects,
    refreshSessionsForProject,
    refreshPreferences
  };
}

