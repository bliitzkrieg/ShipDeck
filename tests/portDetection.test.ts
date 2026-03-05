import { describe, expect, it } from "vitest";
import { parsePortFromLog } from "../src/main/portDetection";

describe("parsePortFromLog", () => {
  it("extracts known localhost formats", () => {
    expect(parsePortFromLog("Local: http://localhost:5173/")).toBe(5173);
    expect(parsePortFromLog("ready at http://127.0.0.1:3000")).toBe(3000);
    expect(parsePortFromLog("visit https://[::1]:8080 now")).toBe(8080);
  });

  it("returns null when not found", () => {
    expect(parsePortFromLog("compiled successfully")).toBeNull();
  });
});