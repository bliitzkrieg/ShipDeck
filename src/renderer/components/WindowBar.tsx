import { Maximize2, Minus, X } from "lucide-react";
import type { ProjectGitStatus } from "../../shared/types";

interface WindowBarProps {
  activeProjectName: string;
  gitStatus: ProjectGitStatus | null;
}

export function WindowBar({ activeProjectName, gitStatus }: WindowBarProps): JSX.Element {
  return (
    <header className="window-bar">
      <div className="window-bar-left">
        <span className="window-bar-product">ShipDeck</span>
        <span className="window-bar-context">Workspace Cockpit</span>
      </div>
      <div className="window-bar-title">
        <span className="window-bar-project">{activeProjectName}</span>
        {gitStatus ? (
          <span className="window-bar-git">
            <span className="window-bar-branch">{gitStatus.branch}</span>
            <span className="window-bar-git-plus">+{gitStatus.added}</span>
            <span className="window-bar-git-minus">-{gitStatus.removed}</span>
          </span>
        ) : null}
      </div>
      <div className="window-bar-controls">
        <button className="window-btn" aria-label="Minimize" onClick={() => void window.api.appWindow.minimize()}>
          <Minus size={12} />
        </button>
        <button className="window-btn" aria-label="Maximize" onClick={() => void window.api.appWindow.toggleMaximize()}>
          <Maximize2 size={12} />
        </button>
        <button className="window-btn close" aria-label="Close" onClick={() => void window.api.appWindow.close()}>
          <X size={12} />
        </button>
      </div>
    </header>
  );
}
