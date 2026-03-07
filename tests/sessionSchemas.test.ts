import { describe, expect, it } from "vitest";
import { createSessionInputSchema, openTerminalInputSchema } from "../src/shared/schemas";

describe("session schema contracts", () => {
  it("accepts optional runtime/interaction modes in create session input", () => {
    const parsed = createSessionInputSchema.parse({
      projectId: "prj_1",
      provider: "codex",
      cliSessionName: "abc",
      runtimeMode: "approval-required",
      interactionMode: "plan"
    });

    expect(parsed.runtimeMode).toBe("approval-required");
    expect(parsed.interactionMode).toBe("plan");
  });

  it("accepts session runtime metadata when opening terminal", () => {
    const parsed = openTerminalInputSchema.parse({
      terminalId: "trm_1",
      projectId: "prj_1",
      cwd: "/tmp/project",
      kind: "shell",
      sessionId: "ses_1",
      sessionProvider: "claude",
      cliSessionName: "session-name",
      sessionMode: "restore",
      sessionRuntimeMode: "full-access",
      sessionInteractionMode: "default"
    });

    expect(parsed.sessionRuntimeMode).toBe("full-access");
    expect(parsed.sessionInteractionMode).toBe("default");
  });
});
