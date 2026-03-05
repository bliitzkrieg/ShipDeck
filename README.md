# ShipDeck

Desktop project cockpit built with Electron + React + TypeScript. It manages local projects, launches per-project terminal sessions (Claude/Codex), and embeds secure localhost previews.

## Stack

- Electron (main + preload + renderer split)
- React 19 + TypeScript
- Vite (renderer build)
- `node-pty` for terminal sessions
- `better-sqlite3` for local metadata state
- `zod` for IPC input validation

## Prerequisites

- Node.js 20+
- pnpm 9+
- Windows/macOS/Linux (current scripts are Windows-friendly but not Windows-only)

## Install

```bash
pnpm install
```

## Run in Development

```bash
pnpm dev
```

This starts:

- Vite renderer dev server
- `tsup` watch for main
- `tsup` watch for preload
- Electron app process

## Build

```bash
pnpm build
```

## Quality Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Native Module Rebuilds

If Electron ABI mismatches appear after dependency changes:

```bash
pnpm rebuild:native
pnpm rebuild:pty
```

## Repository Layout

```text
src/
  main/        Electron main process, IPC handlers, DB, PTY, webview manager
  preload/     Secure bridge (`window.api`) exposed to renderer
  renderer/    React UI (App + components + styles + UI utilities)
  shared/      Shared IPC channel names, schemas, and common types
tests/         Vitest tests for core logic
```

## Data + Runtime Model

- Main process owns:
  - SQLite-backed repository (`src/main/db`)
  - PTY lifecycle + streaming (`src/main/pty/manager.ts`)
  - Webview bounds/visibility and target loading (`src/main/webview/manager.ts`)
- Renderer owns:
  - Session/project UI state
  - Terminal tab selection and modal interactions
  - Calls into main only via `window.api`

## Important Conventions

- IPC payloads are validated in main via Zod before side effects.
- Renderer never accesses Node APIs directly; use preload bridge only.
- Session title edits are user-driven through the rename modal (no automatic title inference).
- First project’s top session is auto-opened on initial app load.

## Common Dev Tasks

- Add a new IPC endpoint:
  1. Add channel in `src/shared/ipc.ts`
  2. Add schema in `src/shared/schemas.ts` (if needed)
  3. Implement handler in `src/main/index.ts`
  4. Expose function in `src/preload/index.ts`
  5. Add typing in `src/renderer/global.d.ts`

- Add renderer UI:
  - Prefer new files in `src/renderer/components/*` and keep `App.tsx` orchestration-focused.

## Troubleshooting

- Terminal not starting:
  - Verify shell availability and run `pnpm rebuild:pty`.
- Electron launch issues after dependency changes:
  - Rebuild native modules and retry.
- No localhost preview:
  - Ensure the project’s dev command actually starts and binds a port.

## Commit Hygiene

Ignored artifacts include:

- `node_modules/`, `dist/`, `.vite/`, `.pnpm-store/`
- Logs and coverage output
- local trace/heap captures (`Trace-*.json`, `Heap-*.heaptimeline`)

Run checks before pushing:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
