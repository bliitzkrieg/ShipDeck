import { z } from "zod";

export const idSchema = z.string().min(1);
export const portSchema = z.number().int().min(1).max(65535);
export const sessionProviderSchema = z.enum(["codex", "claude"]);

export const createProjectInputSchema = z.object({
  name: z.string().min(1),
  rootPath: z.string().min(1),
  devCommand: z.string().min(1),
  defaultPort: portSchema.nullable().optional()
});

export const updateProjectInputSchema = z.object({
  projectId: idSchema,
  name: z.string().min(1).optional(),
  rootPath: z.string().min(1).optional(),
  devCommand: z.string().min(1).optional(),
  defaultPort: portSchema.nullable().optional()
});

export const createSessionInputSchema = z.object({
  projectId: idSchema,
  title: z.string().min(1).optional(),
  provider: sessionProviderSchema,
  cliSessionName: z.string().min(1)
});

export const renameSessionInputSchema = z.object({
  sessionId: idSchema,
  title: z.string().min(1)
});

export const listMessagesInputSchema = z.object({
  sessionId: idSchema,
  limit: z.number().int().positive().max(500).default(100),
  cursor: z.string().optional()
});

export const createMessageInputSchema = z.object({
  sessionId: idSchema,
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1)
});

export const activateSessionInputSchema = z.object({
  sessionId: idSchema
});

export const createTerminalInputSchema = z.object({
  projectId: idSchema,
  name: z.string().min(1),
  kind: z.enum(["server", "shell"])
});

export const openTerminalInputSchema = z.object({
  terminalId: idSchema,
  projectId: idSchema,
  cwd: z.string().min(1),
  kind: z.enum(["server", "shell"]),
  command: z.string().min(1).optional(),
  sessionId: idSchema.optional(),
  sessionProvider: sessionProviderSchema.optional(),
  cliSessionName: z.string().min(1).optional(),
  sessionMode: z.enum(["create", "restore"]).optional()
});

export const terminalIdInputSchema = z.object({
  terminalId: idSchema
});

export const terminalWriteInputSchema = z.object({
  terminalId: idSchema,
  data: z.string()
});

export const terminalResizeInputSchema = z.object({
  terminalId: idSchema,
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
});

export const startServerInputSchema = z.object({
  projectId: idSchema
});

export const setWebTargetInputSchema = z.object({
  sessionId: idSchema,
  port: portSchema,
  path: z.string().min(1).default("/")
});

export const setDefaultSessionProviderInputSchema = z.object({
  provider: sessionProviderSchema.nullable()
});
