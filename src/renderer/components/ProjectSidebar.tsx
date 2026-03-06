import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Pencil, Play, Plus, Square, Terminal, Trash2 } from "lucide-react";
import type { ProjectSidebarActions, ProjectSidebarModel } from "../app/types";
import claudeIcon from "../assets/claude.svg";
import codexIcon from "../assets/codex.svg";
import opencodeIcon from "../assets/opencode.svg";

interface ProjectSidebarProps {
  model: ProjectSidebarModel;
  actions: ProjectSidebarActions;
}

export function ProjectSidebar({ model, actions }: ProjectSidebarProps): JSX.Element {
  const {
    projects,
    sessionsByProject,
    activeProjectId,
    activeSessionId,
    activeTerminalTabKey,
    serverTerminalsByProject,
    shellTabsByProject,
    shellTerminalsByTabId,
    defaultSessionProvider,
    showProviderOverrideMenu
  } = model;

  const providerIconBySession = {
    claude: claudeIcon,
    codex: codexIcon,
    opencode: opencodeIcon
  } as const;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-heading">
          <h1>Projects</h1>
          <p>Manage environments and sessions</p>
        </div>
        <button className="icon-button" onClick={actions.onShowCreateProject} aria-label="Create project">
          <Plus size={14} />
        </button>
      </div>
      <div className="project-tree">
        {projects.length === 0 ? <p className="sidebar-empty">Create a project to start a preview and terminal workflow.</p> : null}
        {projects.map((project) => {
          const sessions = sessionsByProject[project.id] ?? [];
          const shellTabIds = shellTabsByProject[project.id] ?? [];
          const isServerRunning = Boolean(serverTerminalsByProject[project.id]);
          return (
            <section key={project.id} className={project.id === activeProjectId ? "project-group active" : "project-group"}>
              <div className="project-row-wrap">
                <div className="project-info">
                  <button className="project-row" onClick={() => actions.onSelectProject(project.id)}>
                    <span className="project-name">
                      <span className={isServerRunning ? "server-indicator online" : "server-indicator"} />
                      {project.name}
                    </span>
                    <small className="project-root">{project.rootPath}</small>
                  </button>
                </div>
                <div className="project-actions">
                  <button className="project-server-icon" onClick={() => actions.onToggleServer(project.id, isServerRunning)}>
                    {isServerRunning ? <Square size={12} /> : <Play size={12} />}
                  </button>
                  <button className="project-edit" onClick={() => actions.onEditProject(project)}>
                    <Pencil size={12} />
                  </button>
                  <button className="project-delete" onClick={() => actions.onDeleteProject(project.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="thread-list">
                {sessions.map((session) => (
                  <div key={session.id} className={session.id === activeSessionId ? "thread-item active" : "thread-item"}>
                    <button className="thread-label" onClick={() => actions.onActivateSession(project.id, session.id)}>
                      <img src={providerIconBySession[session.provider]} alt="" aria-hidden="true" className="session-provider-icon" />
                      {session.title}
                    </button>
                    <button className="thread-edit" onClick={() => actions.onRenameSession(project.id, session)} aria-label="Rename session">
                      <Pencil size={12} />
                    </button>
                    <button className="thread-delete" onClick={() => actions.onDeleteSession(project.id, session.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {shellTabIds.map((tabId) => {
                  const shell = shellTerminalsByTabId[tabId];
                  if (!shell) {
                    return null;
                  }
                  const tabKey = `shell:${tabId}`;
                  return (
                    <div key={tabKey} className={activeTerminalTabKey === tabKey ? "thread-item active" : "thread-item"}>
                      <button className="thread-label" onClick={() => actions.onActivateTerminalTab(project.id, tabKey)}>
                        <Terminal size={12} />
                        {shell.label}
                      </button>
                      <button className="thread-edit" onClick={() => actions.onRenameTerminal(project.id, tabKey)} aria-label="Rename terminal">
                        <Pencil size={12} />
                      </button>
                      <button className="thread-delete" onClick={() => actions.onCloseTerminalTab(project.id, tabKey)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
                <div className="session-create-row">
                  <button className="thread-new" onClick={() => actions.onOpenCreateSessionFlow(project.id)}>
                    <Plus size={12} /> New Session
                  </button>
                  <Popover.Root
                    open={showProviderOverrideMenu === project.id}
                    onOpenChange={(open) => actions.onProviderMenuOpenChange(project.id, open)}
                  >
                    <Popover.Trigger asChild>
                      <button className="thread-new-provider" aria-label="Session and terminal options">
                        <ChevronDown size={12} />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content className="provider-popover" side="bottom" align="end" sideOffset={6}>
                        <p className="provider-label">Quick actions</p>
                        <button onClick={() => actions.onCreateSessionWithProvider(project.id, "claude")}>New Claude Session</button>
                        <button onClick={() => actions.onCreateSessionWithProvider(project.id, "codex")}>New Codex Session</button>
                        <button onClick={() => actions.onCreateSessionWithProvider(project.id, "opencode")}>New OpenCode Session</button>
                        <button onClick={() => actions.onOpenRegularTerminal(project.id)}>Open Terminal</button>
                        {defaultSessionProvider ? <button onClick={actions.onClearDefaultProvider}>Ask every time</button> : null}
                        <Popover.Arrow className="provider-popover-arrow" />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
