import { X } from "lucide-react";
import type { WorkspacePanelActions, WorkspacePanelModel } from "../app/types";
import claudeIcon from "../assets/claude.svg";
import codexIcon from "../assets/codex.svg";
import opencodeIcon from "../assets/opencode.svg";
import { SessionChatPanel } from "./SessionChatPanel";
import { TerminalPanel } from "./TerminalPanel";

interface WorkspacePanelProps {
  mainColumnRef: React.RefObject<HTMLElement | null>;
  webviewPanelRef: React.RefObject<HTMLElement | null>;
  model: WorkspacePanelModel;
  actions: WorkspacePanelActions;
}

export function WorkspacePanel({ mainColumnRef, webviewPanelRef, model, actions }: WorkspacePanelProps): JSX.Element {
  const {
    isServerRunning,
    workspaceView,
    webTargetText,
    serverError,
    terminalTabs,
    activeTerminalTabKey,
    activeProjectId,
    activeTerminalId,
    activeSession
  } = model;

  const providerIconBySession = {
    claude: claudeIcon,
    codex: codexIcon,
    opencode: opencodeIcon
  } as const;

  // Determine which panel type to show.
  const isSessionTab = activeTerminalTabKey?.startsWith("session:") ?? false;
  const showChatPanel = isSessionTab && activeSession !== null;

  return (
    <main ref={mainColumnRef} className="main-column">
      <section className="workspace-panel full-height">
        {serverError ? <div className="panel-error">{serverError}</div> : null}

        <div className="panel-header workspace-view-header">
          <div className="workspace-view-tabs" role="tablist" aria-label="Workspace view">
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === "terminal"}
              className={workspaceView === "terminal" ? "workspace-view-tab active" : "workspace-view-tab"}
              onClick={() => actions.onSelectWorkspaceView("terminal")}
            >
              Terminal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === "live"}
              className={workspaceView === "live" ? "workspace-view-tab active" : "workspace-view-tab"}
              onClick={() => actions.onSelectWorkspaceView("live")}
              disabled={!isServerRunning}
              title={!isServerRunning ? "Start server to open live view" : "Ctrl/Cmd+2"}
            >
              Live View
            </button>
          </div>
          <span className="panel-meta">
            {workspaceView === "terminal" ? `${terminalTabs.length} open tabs` : webTargetText}
          </span>
        </div>

        {workspaceView === "live" ? (
          <section className="webview-panel webview-panel-full" ref={webviewPanelRef}>
            {isServerRunning ? null : (
              <div className="empty-main">
                <div className="empty-main-card">
                  <h2>Live View Unavailable</h2>
                  <p>Start the project server from the sidebar to open live preview.</p>
                </div>
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="terminal-tabbar">
              {terminalTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={activeTerminalTabKey === tab.key ? "terminal-tab active" : "terminal-tab"}
                  onClick={() => actions.onSelectTerminalTab(tab.key)}
                >
                  {tab.kind === "session" && tab.provider ? (
                    <img
                      src={providerIconBySession[tab.provider]}
                      alt=""
                      aria-hidden="true"
                      className="terminal-tab-provider-icon"
                    />
                  ) : null}
                  <span>{tab.label}</span>
                  {tab.closable ? (
                    <button
                      type="button"
                      className="terminal-tab-close"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!activeProjectId) {
                          return;
                        }
                        if (tab.kind === "session" && tab.sessionId) {
                          actions.onCloseSessionTab(tab.sessionId);
                          return;
                        }
                        actions.onCloseTerminalTab(tab.key);
                      }}
                      aria-label={`Close ${tab.label}`}
                    >
                      <X size={11} />
                    </button>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="terminal-inline">
              {terminalTabs.length === 0 ? (
                <div className="empty-main">
                  <div className="empty-main-card">
                    <h2>No Active Session</h2>
                    <p>Select a project and create a session from the sidebar to open terminal tabs here.</p>
                  </div>
                </div>
              ) : showChatPanel ? (
                <SessionChatPanel terminalId={activeTerminalId} session={activeSession} />
              ) : (
                <TerminalPanel activeTerminalId={activeTerminalId} />
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
