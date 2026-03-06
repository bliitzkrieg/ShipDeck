import { describe, expect, it } from "vitest";
import { sessionProviderSchema } from "../src/shared/schemas";

describe("sessionProviderSchema", () => {
  it("accepts opencode provider", () => {
    expect(sessionProviderSchema.parse("opencode")).toBe("opencode");
  });
});
