import { describe, expect, it } from "vitest";
import { providerBootCommand, providerLabel, providerRenameCommand, providerResumeLaunchCommand } from "../src/renderer/utils/sessionProvider";

describe("session provider utilities", () => {
  it("supports opencode labels and commands", () => {
    expect(providerLabel("opencode")).toBe("OpenCode");
    expect(providerBootCommand("opencode")).toBe("opencode");
    expect(providerResumeLaunchCommand("opencode", "ses-name")).toBe("opencode");
    expect(providerRenameCommand("opencode", "ses-name")).toBe("");
  });
});
