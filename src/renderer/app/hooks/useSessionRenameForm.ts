import { useCallback, useState } from "react";
import type { Session } from "../../../shared/types";
import type { SessionsByProject } from "../types";

interface UseSessionRenameFormInput {
  sessionsByProject: SessionsByProject;
  setSessionsByProject: React.Dispatch<React.SetStateAction<SessionsByProject>>;
}

interface SessionRenameForm {
  showSessionRenameModal: boolean;
  sessionTitleDraft: string;
  sessionRenameError: string | null;
  setSessionTitleDraft: (value: string) => void;
  openRenameSession: (projectId: string, session: Session) => void;
  closeRenameModal: () => void;
  submitSessionRename: () => void;
}

export function useSessionRenameForm({ sessionsByProject, setSessionsByProject }: UseSessionRenameFormInput): SessionRenameForm {
  const [showSessionRenameModal, setShowSessionRenameModal] = useState(false);
  const [sessionRenameProjectId, setSessionRenameProjectId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [sessionRenameError, setSessionRenameError] = useState<string | null>(null);

  const openRenameSession = useCallback((projectId: string, session: Session): void => {
    setSessionRenameProjectId(projectId);
    setEditingSessionId(session.id);
    setSessionTitleDraft(session.title);
    setSessionRenameError(null);
    setShowSessionRenameModal(true);
  }, []);

  const closeRenameModal = useCallback((): void => {
    setShowSessionRenameModal(false);
    setSessionRenameError(null);
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
  }, [editingSessionId, sessionRenameProjectId, sessionTitleDraft, sessionsByProject, setSessionsByProject]);

  return {
    showSessionRenameModal,
    sessionTitleDraft,
    sessionRenameError,
    setSessionTitleDraft,
    openRenameSession,
    closeRenameModal,
    submitSessionRename
  };
}
