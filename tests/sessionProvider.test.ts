import { describe, expect, it } from "vitest";
import {
  generateCliSessionName,
  providerBootCommand,
  providerLabel,
  providerRenameCommand,
  providerResumeLaunchCommand
} from "../src/renderer/utils/sessionProvider";

describe("session provider helpers", () => {
  it("returns expected provider labels and boot commands", () => {
    expect(providerLabel("codex")).toBe("Codex");
    expect(providerLabel("claude")).toBe("Claude");
    expect(providerBootCommand("codex")).toBe("codex");
    expect(providerBootCommand("claude")).toBe("claude");
  });

  it("builds provider-specific resume commands", () => {
    expect(providerResumeLaunchCommand("claude", "abc")).toBe("claude --resume abc");
    expect(providerResumeLaunchCommand("codex", "not-a-uuid")).toBe("codex resume");
    expect(providerResumeLaunchCommand("codex", "123e4567-e89b-12d3-a456-426614174000")).toBe(
      "codex resume 123e4567-e89b-12d3-a456-426614174000"
    );
  });

  it("returns provider-specific rename support", () => {
    expect(providerRenameCommand("codex", "x")).toBe("");
    expect(providerRenameCommand("claude", "x")).toBe("/rename x");
  });

  it("generates cli session names with provider prefix", () => {
    const codex = generateCliSessionName("codex");
    const claude = generateCliSessionName("claude");

    expect(codex.startsWith("codex-")).toBe(true);
    expect(claude.startsWith("claude-")).toBe(true);
    expect(codex).not.toBe(claude);
  });
});
