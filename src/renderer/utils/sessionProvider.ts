import type { SessionProvider } from "../../shared/types";

export function providerLabel(provider: SessionProvider): string {
  return provider === "codex" ? "Codex" : "Claude";
}

export function providerBootCommand(provider: SessionProvider): string {
  return provider === "codex" ? "codex" : "claude";
}

export function providerResumeLaunchCommand(provider: SessionProvider, name: string): string {
  if (provider !== "codex") {
    return `claude --resume ${name}`;
  }
  return "codex";
}

export function providerRenameCommand(provider: SessionProvider, name: string): string {
  if (provider === "codex") {
    return "";
  }
  return `/rename ${name}`;
}

export function generateCliSessionName(provider: SessionProvider): string {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(
    now.getHours()
  ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return `${provider}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeSessionTabKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export function parseSessionTabKey(tabKey: string): string | null {
  return tabKey.startsWith("session:") ? tabKey.slice(8) : null;
}
