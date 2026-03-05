import { X } from "lucide-react";
import { TerminalPanel } from "./TerminalPanel";

interface TerminalTab {
  key: string;
  label: string;
  sessionId: string | null;
}

interface WorkspacePanelProps {
  mainColumnRef: React.RefObject<HTMLElement | null>;
  webviewPanelRef: React.RefObject<HTMLElement | null>;
  isServerRunning: boolean;
  previewSplitPercent: number;
  webTargetText: string;
  serverError: string | null;
  terminalTabs: TerminalTab[];
  activeTerminalTabKey: string | null;
  activeProjectId: string | null;
  activeTerminalId: string | null;
  onSelectTerminalTab: (tabKey: string) => void;
  onCloseSessionTab: (sessionId: string) => void;
  onSplitterMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export function WorkspacePanel({
  mainColumnRef,
  webviewPanelRef,
  isServerRunning,
  previewSplitPercent,
  webTargetText,
  serverError,
  terminalTabs,
  activeTerminalTabKey,
  activeProjectId,
  activeTerminalId,
  onSelectTerminalTab,
  onCloseSessionTab,
  onSplitterMouseDown
}: WorkspacePanelProps): JSX.Element {
  return (
    <main
      ref={mainColumnRef}
      className={isServerRunning ? "main-column with-preview" : "main-column"}
      style={isServerRunning ? { gridTemplateRows: `${previewSplitPercent}fr 8px ${100 - previewSplitPercent}fr` } : undefined}
    >
      {isServerRunning ? (
        <section className="webview-panel" ref={webviewPanelRef}>
          <div className="panel-header">
            <h2>Live Preview</h2>
            <span>{webTargetText}</span>
          </div>
          <div className="webview-hint">
            <p>The secure WebContentsView is managed in the Electron main process and rendered in this region.</p>
          </div>
        </section>
      ) : null}
      {isServerRunning ? <div className="splitter" onMouseDown={onSplitterMouseDown} /> : null}
      <section className={isServerRunning ? "workspace-panel with-preview" : "workspace-panel full-height"}>
        {serverError ? <div className="panel-error">{serverError}</div> : null}
        <div className="terminal-tabbar">
          {terminalTabs.map((tab) => (
            <button
              key={tab.key}
              className={activeTerminalTabKey === tab.key ? "terminal-tab active" : "terminal-tab"}
              onClick={() => onSelectTerminalTab(tab.key)}
            >
              <span>{tab.label}</span>
              {tab.sessionId ? (
                <span
                  className="terminal-tab-close"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!activeProjectId) {
                      return;
                    }
                    onCloseSessionTab(tab.sessionId as string);
                  }}
                >
                  <X size={11} />
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="terminal-inline">
          <TerminalPanel activeTerminalId={activeTerminalId} />
        </div>
      </section>
    </main>
  );
}
