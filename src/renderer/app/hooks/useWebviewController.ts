import { useEffect, useRef } from "react";
import type { Project } from "../../../shared/types";

interface UseWebviewControllerInput {
  projects: Project[];
  activeProjectId: string | null;
  isServerRunning: boolean;
  hasBlockingModal: boolean;
  webviewPanelRef: React.RefObject<HTMLElement | null>;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setWebTargetText: React.Dispatch<React.SetStateAction<string>>;
  removeTerminalMappingsByTerminalId: (terminalId: string) => void;
}

export function useWebviewController({
  projects,
  activeProjectId,
  isServerRunning,
  hasBlockingModal,
  webviewPanelRef,
  setActiveProjectId,
  setActiveSessionId,
  setWebTargetText,
  removeTerminalMappingsByTerminalId
}: UseWebviewControllerInput): void {
  const projectsRef = useRef<Project[]>([]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

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
      removeTerminalMappingsByTerminalId(terminalId);
    });

    return () => {
      unsubContext();
      unsubPort();
      unsubExit();
    };
  }, [activeProjectId, removeTerminalMappingsByTerminalId, setActiveProjectId, setActiveSessionId, setWebTargetText]);

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
  }, [isServerRunning, webviewPanelRef]);

  useEffect(() => {
    void window.api.webView.setVisible({ visible: isServerRunning && !hasBlockingModal });
  }, [hasBlockingModal, isServerRunning]);
}
