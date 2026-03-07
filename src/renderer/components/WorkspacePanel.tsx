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
    previewSplitPercent,
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
    <main
      ref={mainColumnRef}
      className={isServerRunning ? "main-column with-preview" : "main-column"}
      style={
        isServerRunning
          ? { gridTemplateRows: `minmax(0, ${previewSplitPercent}fr) 8px minmax(0, ${100 - previewSplitPercent}fr)` }
          : undefined
      }
    >
      {isServerRunning ? (
        <section className="webview-panel" ref={webviewPanelRef}>
          <div className="panel-header">
            <h2>Live Preview</h2>
            <span className="panel-meta">{webTargetText}</span>
          </div>
          <div className="webview-hint">
            <p>The secure WebContentsView is managed in the Electron main process and rendered in this region.</p>
          </div>
        </section>
      ) : null}
      {isServerRunning ? <div className="splitter" onMouseDown={actions.onSplitterMouseDown} /> : null}
      <section className={isServerRunning ? "workspace-panel with-preview" : "workspace-panel full-height"}>
        {serverError ? <div className="panel-error">{serverError}</div> : null}
        <div className="panel-header terminal-header">
          <h2>Terminal Workspace</h2>
          <span className="panel-meta">{terminalTabs.length} open tabs</span>
        </div>
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
            <SessionChatPanel
              terminalId={activeTerminalId}
              session={activeSession}
            />
          ) : (
            <TerminalPanel activeTerminalId={activeTerminalId} />
          )}
        </div>
      </section>
    </main>
  );
}
