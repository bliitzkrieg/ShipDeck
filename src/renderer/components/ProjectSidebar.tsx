import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Pencil, Play, Plus, Square, Trash2 } from "lucide-react";
import type { ProjectSidebarActions, ProjectSidebarModel } from "../app/types";

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
    serverTerminalsByProject,
    defaultSessionProvider,
    showProviderOverrideMenu
  } = model;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Shipdeck</h1>
        <button className="icon-button" onClick={actions.onShowCreateProject}>
          <Plus size={14} />
        </button>
      </div>
      <div className="project-tree">
        {projects.map((project) => {
          const sessions = sessionsByProject[project.id] ?? [];
          const isServerRunning = Boolean(serverTerminalsByProject[project.id]);
          return (
            <section key={project.id} className={project.id === activeProjectId ? "project-group active" : "project-group"}>
              <div className="project-row-wrap">
                <div className="project-info">
                  <button className="project-row" onClick={() => actions.onSelectProject(project.id)}>
                    <span className="project-name">{project.name}</span>
                  </button>
                </div>
                <div className="project-actions">
                  <button className="project-edit" onClick={() => actions.onEditProject(project)}>
                    <Pencil size={12} />
                  </button>
                  <button className="project-delete" onClick={() => actions.onDeleteProject(project.id)}>
                    <Trash2 size={12} />
                  </button>
                  <button className="project-server-icon" onClick={() => actions.onToggleServer(project.id, isServerRunning)}>
                    {isServerRunning ? <Square size={12} /> : <Play size={12} />}
                  </button>
                </div>
              </div>
              <div className="thread-list">
                {sessions.map((session) => (
                  <div key={session.id} className={session.id === activeSessionId ? "thread-item active" : "thread-item"}>
                    <button className="thread-label" onClick={() => actions.onActivateSession(project.id, session.id)}>
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
                <div className="session-create-row">
                  <button className="thread-new" onClick={() => actions.onOpenCreateSessionFlow(project.id)}>
                    <Plus size={12} /> New Session
                  </button>
                  {defaultSessionProvider ? (
                    <Popover.Root
                      open={showProviderOverrideMenu === project.id}
                      onOpenChange={(open) => actions.onProviderMenuOpenChange(project.id, open)}
                    >
                      <Popover.Trigger asChild>
                        <button className="thread-new-provider" aria-label="Session provider options">
                          <ChevronDown size={12} />
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content className="provider-popover" side="bottom" align="end" sideOffset={6}>
                          <button onClick={() => actions.onCreateSessionWithProvider(project.id, "claude")}>Claude</button>
                          <button onClick={() => actions.onCreateSessionWithProvider(project.id, "codex")}>Codex</button>
                          <button onClick={actions.onClearDefaultProvider}>Ask every time</button>
                          <Popover.Arrow className="provider-popover-arrow" />
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
