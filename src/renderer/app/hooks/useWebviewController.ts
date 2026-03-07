import { useEffect, useRef } from "react";
import type { Project } from "../../../shared/types";

interface UseWebviewControllerInput {
  projects: Project[];
  activeProjectId: string | null;
  isServerRunning: boolean;
  isLiveViewActive: boolean;
  hasBlockingModal: boolean;
  webviewPanelRef: React.RefObject<HTMLElement | null>;
  setActiveProjectId: (projectId: string | null) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setWebTargetText: (value: string) => void;
  removeServerTerminalMappingByTerminalId: (terminalId: string) => void;
}

export function useWebviewController({
  projects,
  activeProjectId,
  isServerRunning,
  isLiveViewActive,
  hasBlockingModal,
  webviewPanelRef,
  setActiveProjectId,
  setActiveSessionId,
  setWebTargetText,
  removeServerTerminalMappingByTerminalId
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
      removeServerTerminalMappingByTerminalId(terminalId);
    });

    return () => {
      unsubContext();
      unsubPort();
      unsubExit();
    };
  }, [activeProjectId, removeServerTerminalMappingByTerminalId, setActiveProjectId, setActiveSessionId, setWebTargetText]);

  useEffect(() => {
    if (!isServerRunning || !isLiveViewActive) {
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

    // Run immediately and once more on next frame after layout settles.
    updateBounds();
    const raf = window.requestAnimationFrame(updateBounds);

    const resizeObserver = new ResizeObserver(() => updateBounds());
    if (webviewPanelRef.current) {
      resizeObserver.observe(webviewPanelRef.current);
    }
    window.addEventListener("resize", updateBounds);

    return () => {
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [isLiveViewActive, isServerRunning, webviewPanelRef]);

  useEffect(() => {
    if (!activeProjectId) {
      setWebTargetText("No active localhost target");
      return;
    }

    if (!isServerRunning) {
      setWebTargetText("No active localhost target");
      return;
    }

    const selectedProject = projects.find((project) => project.id === activeProjectId) ?? null;
    const fallbackPort = selectedProject?.defaultPort ?? null;
    let cancelled = false;

    if (fallbackPort) {
      const fallbackUrl = `http://localhost:${fallbackPort}/`;
      setWebTargetText(fallbackUrl);
      void window.api.webView.loadTarget({ url: fallbackUrl }).catch(() => {
        // Ignore startup/race errors; port updates will retry navigation.
      });
      return;
    }

    void window.api.server
      .getLatestPort({ projectId: activeProjectId })
      .then(({ port }) => {
        if (cancelled || !port) {
          return;
        }
        const targetUrl = `http://localhost:${port}/`;
        setWebTargetText(targetUrl);
        return window.api.webView.loadTarget({ url: targetUrl }).catch(() => {
          // Ignore startup/race errors; port updates will retry navigation.
        });
      })
      .catch(() => {
        if (!cancelled) {
          setWebTargetText("No active localhost target");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, isServerRunning, projects, setWebTargetText]);

  useEffect(() => {
    const visible = isServerRunning && isLiveViewActive && !hasBlockingModal;
    void window.api.webView.setVisible({ visible });
    if (!visible) {
      void window.api.webView.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    }
  }, [hasBlockingModal, isLiveViewActive, isServerRunning]);
}
