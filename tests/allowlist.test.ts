import { describe, expect, it } from "vitest";
import { isAllowedLoopbackUrl } from "../src/main/security/allowlist";

describe("isAllowedLoopbackUrl", () => {
  it("allows localhost urls", () => {
    expect(isAllowedLoopbackUrl("http://localhost:3000/")).toBe(true);
    expect(isAllowedLoopbackUrl("https://127.0.0.1:5173/path")).toBe(true);
    expect(isAllowedLoopbackUrl("http://[::1]:8080/")).toBe(true);
  });

  it("rejects non-loopback or unsafe protocols", () => {
    expect(isAllowedLoopbackUrl("http://example.com")).toBe(false);
    expect(isAllowedLoopbackUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedLoopbackUrl("javascript:alert(1)")).toBe(false);
  });
});