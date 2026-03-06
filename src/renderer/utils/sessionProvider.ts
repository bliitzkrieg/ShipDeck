import type { SessionProvider } from "../../shared/types";

export function providerLabel(provider: SessionProvider): string {
  switch (provider) {
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
    case "opencode":
      return "OpenCode";
  }
}

export function providerBootCommand(provider: SessionProvider): string {
  switch (provider) {
    case "codex":
      return "codex";
    case "claude":
      return "claude";
    case "opencode":
      return "opencode";
  }
}

export function providerResumeLaunchCommand(provider: SessionProvider, name: string): string {
  switch (provider) {
    case "codex":
      return "codex";
    case "claude":
      return `claude --resume ${name}`;
    case "opencode":
      return "opencode";
  }
}

export function providerRenameCommand(provider: SessionProvider, name: string): string {
  switch (provider) {
    case "codex":
      return "";
    case "claude":
      return `/rename ${name}`;
    case "opencode":
      return "";
  }
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
