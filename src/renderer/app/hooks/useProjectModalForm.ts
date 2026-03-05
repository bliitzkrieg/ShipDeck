import { useCallback, useState } from "react";
import type { Project } from "../../../shared/types";

interface UseProjectModalFormInput {
  refreshProjects: () => Promise<void>;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | null>>;
}

interface ProjectModalForm {
  showProjectModal: boolean;
  editingProjectId: string | null;
  projectName: string;
  projectPath: string;
  projectCommand: string;
  projectDefaultPort: string;
  projectModalError: string | null;
  setProjectName: (value: string) => void;
  setProjectPath: (value: string) => void;
  setProjectCommand: (value: string) => void;
  setProjectDefaultPort: (value: string) => void;
  openCreateProject: () => void;
  openEditProject: (project: Project) => void;
  closeProjectModal: () => void;
  submitProject: () => Promise<void>;
}

export function useProjectModalForm({ refreshProjects, setActiveProjectId }: UseProjectModalFormInput): ProjectModalForm {
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [projectCommand, setProjectCommand] = useState("pnpm dev");
  const [projectDefaultPort, setProjectDefaultPort] = useState("");
  const [projectModalError, setProjectModalError] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const openCreateProject = useCallback((): void => {
    setShowProjectModal(true);
    setEditingProjectId(null);
    setProjectModalError(null);
    setProjectName("");
    setProjectPath("");
    setProjectCommand("pnpm dev");
    setProjectDefaultPort("");
  }, []);

  const openEditProject = useCallback((project: Project): void => {
    setEditingProjectId(project.id);
    setProjectName(project.name);
    setProjectPath(project.rootPath);
    setProjectCommand(project.devCommand);
    setProjectDefaultPort(project.defaultPort ? String(project.defaultPort) : "");
    setProjectModalError(null);
    setShowProjectModal(true);
  }, []);

  const closeProjectModal = useCallback((): void => {
    setShowProjectModal(false);
  }, []);

  const submitProject = useCallback(async (): Promise<void> => {
    if (!projectName || !projectPath || !projectCommand) {
      setProjectModalError("Name, root path, and dev command are required.");
      return;
    }

    let defaultPort: number | null = null;
    if (projectDefaultPort.trim()) {
      const parsed = Number(projectDefaultPort);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        setProjectModalError("Default port must be between 1 and 65535.");
        return;
      }
      defaultPort = parsed;
    }

    const savedProject = editingProjectId
      ? await window.api.projects.update({
          projectId: editingProjectId,
          name: projectName,
          rootPath: projectPath,
          devCommand: projectCommand,
          defaultPort
        })
      : await window.api.projects.create({ name: projectName, rootPath: projectPath, devCommand: projectCommand, defaultPort });

    setShowProjectModal(false);
    setEditingProjectId(null);
    setProjectModalError(null);
    await refreshProjects();
    setActiveProjectId(savedProject.id);
  }, [editingProjectId, projectCommand, projectDefaultPort, projectName, projectPath, refreshProjects, setActiveProjectId]);

  return {
    showProjectModal,
    editingProjectId,
    projectName,
    projectPath,
    projectCommand,
    projectDefaultPort,
    projectModalError,
    setProjectName,
    setProjectPath,
    setProjectCommand,
    setProjectDefaultPort,
    openCreateProject,
    openEditProject,
    closeProjectModal,
    submitProject
  };
}
