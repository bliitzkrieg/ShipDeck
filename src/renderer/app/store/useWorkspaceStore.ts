import { create } from "zustand";
import { createWorkspaceActions } from "./workspaceStore.actions";
import { workspaceInitialState } from "./workspaceStore.initialState";
import type { WorkspaceStore } from "./workspaceStore.types";

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  ...workspaceInitialState,
  ...createWorkspaceActions(set, get)
}));
