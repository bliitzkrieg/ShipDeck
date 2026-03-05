const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isAllowedLoopbackUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const protocolAllowed = url.protocol === "http:" || url.protocol === "https:";
    if (!protocolAllowed) {
      return false;
    }

    const host = url.hostname;
    return LOOPBACK_HOSTS.has(host);
  } catch {
    return false;
  }
}