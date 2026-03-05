import { FolderOpen } from "lucide-react";

interface ProjectModalProps {
  editingProjectId: string | null;
  projectModalError: string | null;
  projectName: string;
  projectPath: string;
  projectCommand: string;
  projectDefaultPort: string;
  setProjectName: (value: string) => void;
  setProjectPath: (value: string) => void;
  setProjectCommand: (value: string) => void;
  setProjectDefaultPort: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function ProjectModal({
  editingProjectId,
  projectModalError,
  projectName,
  projectPath,
  projectCommand,
  projectDefaultPort,
  setProjectName,
  setProjectPath,
  setProjectCommand,
  setProjectDefaultPort,
  onClose,
  onSubmit
}: ProjectModalProps): JSX.Element {
  return (
    <div className="modal-backdrop">
      <section className="modal-card">
        <h3>{editingProjectId ? "Edit Project" : "Create Project"}</h3>
        {projectModalError ? <div className="panel-error">{projectModalError}</div> : null}
        <label>
          Name
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="My app" />
        </label>
        <label>
          Root Path
          <div className="path-row">
            <input value={projectPath} onChange={(event) => setProjectPath(event.target.value)} />
            <button
              className="browse-button"
              onClick={() => void window.api.projects.pickRootPath().then((path) => path && setProjectPath(path))}
            >
              <FolderOpen size={12} /> Browse
            </button>
          </div>
        </label>
        <label>
          Dev Command
          <input value={projectCommand} onChange={(event) => setProjectCommand(event.target.value)} placeholder="pnpm dev" />
        </label>
        <label>
          Default Port
          <input
            type="number"
            min={1}
            max={65535}
            value={projectDefaultPort}
            onChange={(event) => setProjectDefaultPort(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button onClick={onSubmit}>{editingProjectId ? "Save Changes" : "Create Project"}</button>
        </div>
      </section>
    </div>
  );
}
