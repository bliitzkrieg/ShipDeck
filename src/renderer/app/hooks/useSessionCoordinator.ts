import { useCallback, useState } from "react";
import type { Session, SessionProvider } from "../../../shared/types";
import { generateCliSessionName, providerLabel } from "../../utils/sessionProvider";
import type { SessionsByProject } from "../types";

interface UseSessionCoordinatorInput {
  defaultSessionProvider: SessionProvider | null;
  refreshPreferences: () => Promise<void>;
  refreshSessionsForProject: (projectId: string) => Promise<Session[]>;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  ensureSessionTabOpen: (projectId: string, sessionId: string) => void;
  openSessionTerminal: (session: {
    id: string;
    projectId: string;
    title: string;
    provider: SessionProvider;
    cliSessionName: string;
  }, mode: "create" | "restore") => Promise<void>;
  sessionsByProject: SessionsByProject;
}

interface SessionCoordinator {
  showSessionProviderModal: boolean;
  sessionProviderProjectId: string | null;
  rememberSessionProviderChoice: boolean;
  showProviderOverrideMenu: string | null;
  setRememberSessionProviderChoice: React.Dispatch<React.SetStateAction<boolean>>;
  activateSession: (projectId: string, sessionId: string) => Promise<void>;
  openCreateSessionFlow: (projectId: string) => Promise<void>;
  onProviderMenuOpenChange: (projectId: string, open: boolean) => void;
  onCreateSessionWithProvider: (projectId: string, provider: SessionProvider) => void;
  onClearDefaultProvider: () => void;
  onSelectProvider: (provider: SessionProvider) => void;
  closeProviderModal: () => void;
}

export function useSessionCoordinator({
  defaultSessionProvider,
  refreshPreferences,
  refreshSessionsForProject,
  setActiveProjectId,
  setActiveSessionId,
  ensureSessionTabOpen,
  openSessionTerminal,
  sessionsByProject
}: UseSessionCoordinatorInput): SessionCoordinator {
  const [showSessionProviderModal, setShowSessionProviderModal] = useState(false);
  const [sessionProviderProjectId, setSessionProviderProjectId] = useState<string | null>(null);
  const [rememberSessionProviderChoice, setRememberSessionProviderChoice] = useState(false);
  const [showProviderOverrideMenu, setShowProviderOverrideMenu] = useState<string | null>(null);

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
    [ensureSessionTabOpen, openSessionTerminal, refreshSessionsForProject, setActiveProjectId, setActiveSessionId]
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
    [ensureSessionTabOpen, openSessionTerminal, sessionsByProject, setActiveProjectId, setActiveSessionId]
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

  const onSelectProvider = useCallback(
    (provider: SessionProvider): void => {
      if (!sessionProviderProjectId) {
        return;
      }
      if (rememberSessionProviderChoice) {
        void window.api.preferences.setDefaultSessionProvider({ provider }).then(() => refreshPreferences());
      }
      setShowSessionProviderModal(false);
      void createSession(sessionProviderProjectId, provider);
    },
    [createSession, refreshPreferences, rememberSessionProviderChoice, sessionProviderProjectId]
  );

  const closeProviderModal = useCallback((): void => {
    setShowSessionProviderModal(false);
  }, []);

  return {
    showSessionProviderModal,
    sessionProviderProjectId,
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
  };
}

