const PORT_PATTERNS = [
  /https?:\/\/localhost:(\d{2,5})/i,
  /https?:\/\/127\.0\.0\.1:(\d{2,5})/i,
  /https?:\/\/0\.0\.0\.0:(\d{2,5})/i,
  /https?:\/\/\[::1\]:(\d{2,5})/i,
  /\bLocal:\s*https?:\/\/localhost:(\d{2,5})/i,
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})\b/i
];

export function parsePortFromLog(line: string): number | null {
  for (const pattern of PORT_PATTERNS) {
    const match = line.match(pattern);
    if (!match) {
      continue;
    }

    const port = Number(match[1]);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      return port;
    }
  }

  return null;
}
