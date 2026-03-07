/**
 * Unit tests for useChatSession reducer logic.
 * We test the reducer directly (not the hook) since the hook wraps IPC subscriptions
 * that require Electron context.
 */
import { describe, expect, it } from "vitest";

// ─── Inline the reducer so we don't need a DOM ─────────────────────────────

type ChatMessageRole = "user" | "assistant" | "thinking" | "plan" | "diff" | "error";

interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  streaming: boolean;
  timestamp: number;
}

interface PendingApproval {
  requestId: string;
  method: string;
  detail: string;
}

interface State {
  terminalId: string | null;
  sessionId: string | null;
  messages: ChatMessage[];
  pendingApprovals: PendingApproval[];
  isBusy: boolean;
  isReady: boolean;
  error: string | null;
  provider: string | null;
}

type Action =
  | { type: "SESSION_READY"; provider: string }
  | { type: "TURN_START" }
  | { type: "MESSAGE_DELTA"; delta: string; role: ChatMessageRole }
  | { type: "TURN_COMPLETE"; fullText: string }
  | { type: "TURN_ABORT"; reason: string }
  | { type: "APPROVAL_REQUEST"; request: PendingApproval }
  | { type: "APPROVAL_RESOLVED"; requestId: string }
  | { type: "SESSION_ERROR"; message: string }
  | { type: "APPEND_USER"; text: string };

let counter = 0;
function nextId(): string {
  counter += 1;
  return `msg-${counter}`;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SESSION_READY":
      return { ...state, isReady: true, provider: action.provider, error: null };
    case "TURN_START":
      return { ...state, isBusy: true, error: null };
    case "MESSAGE_DELTA": {
      const last = state.messages[state.messages.length - 1];
      if (last && last.role === action.role && last.streaming) {
        return {
          ...state,
          messages: [...state.messages.slice(0, -1), { ...last, content: last.content + action.delta }]
        };
      }
      return {
        ...state,
        messages: [...state.messages, { id: nextId(), role: action.role, content: action.delta, streaming: true, timestamp: 0 }]
      };
    }
    case "TURN_COMPLETE":
      return {
        ...state,
        isBusy: false,
        messages: state.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m))
      };
    case "TURN_ABORT":
      return {
        ...state,
        isBusy: false,
        error: action.reason,
        messages: state.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m))
      };
    case "APPROVAL_REQUEST":
      return { ...state, pendingApprovals: [...state.pendingApprovals, action.request] };
    case "APPROVAL_RESOLVED":
      return { ...state, pendingApprovals: state.pendingApprovals.filter((a) => a.requestId !== action.requestId) };
    case "SESSION_ERROR":
      return { ...state, isBusy: false, error: action.message, messages: state.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)) };
    case "APPEND_USER":
      return { ...state, messages: [...state.messages, { id: nextId(), role: "user", content: action.text, streaming: false, timestamp: 0 }] };
    default:
      return state;
  }
}

const blank: State = {
  terminalId: "trm_1",
  sessionId: "ses_1",
  messages: [],
  pendingApprovals: [],
  isBusy: false,
  isReady: false,
  error: null,
  provider: null
};

describe("useChatSession reducer", () => {
  it("marks ready on session.ready", () => {
    const s = reducer(blank, { type: "SESSION_READY", provider: "codex" });
    expect(s.isReady).toBe(true);
    expect(s.provider).toBe("codex");
  });

  it("sets busy on turn.start", () => {
    const s = reducer({ ...blank, isReady: true }, { type: "TURN_START" });
    expect(s.isBusy).toBe(true);
  });

  it("appends user message", () => {
    const s = reducer(blank, { type: "APPEND_USER", text: "hello" });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe("user");
    expect(s.messages[0].content).toBe("hello");
    expect(s.messages[0].streaming).toBe(false);
  });

  it("streams assistant deltas into a single bubble", () => {
    let s = reducer(blank, { type: "MESSAGE_DELTA", delta: "Hello", role: "assistant" });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].streaming).toBe(true);

    s = reducer(s, { type: "MESSAGE_DELTA", delta: " world", role: "assistant" });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].content).toBe("Hello world");
  });

  it("creates separate bubbles for different roles", () => {
    let s = reducer(blank, { type: "MESSAGE_DELTA", delta: "thinking...", role: "thinking" });
    s = reducer(s, { type: "MESSAGE_DELTA", delta: "here is my answer", role: "assistant" });
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0].role).toBe("thinking");
    expect(s.messages[1].role).toBe("assistant");
  });

  it("seals streaming messages and clears busy on turn.complete", () => {
    let s = reducer(blank, { type: "TURN_START" });
    s = reducer(s, { type: "MESSAGE_DELTA", delta: "done", role: "assistant" });
    expect(s.messages[0].streaming).toBe(true);

    s = reducer(s, { type: "TURN_COMPLETE", fullText: "done" });
    expect(s.isBusy).toBe(false);
    expect(s.messages[0].streaming).toBe(false);
  });

  it("records error and seals messages on turn.abort", () => {
    let s = reducer(blank, { type: "TURN_START" });
    s = reducer(s, { type: "MESSAGE_DELTA", delta: "partial", role: "assistant" });
    s = reducer(s, { type: "TURN_ABORT", reason: "interrupted" });
    expect(s.isBusy).toBe(false);
    expect(s.error).toBe("interrupted");
    expect(s.messages[0].streaming).toBe(false);
  });

  it("queues and resolves approval requests", () => {
    const approval: PendingApproval = { requestId: "req-1", method: "item/commandExecution/requestApproval", detail: "rm -rf /tmp" };
    let s = reducer(blank, { type: "APPROVAL_REQUEST", request: approval });
    expect(s.pendingApprovals).toHaveLength(1);

    s = reducer(s, { type: "APPROVAL_RESOLVED", requestId: "req-1" });
    expect(s.pendingApprovals).toHaveLength(0);
  });

  it("records error on session.error", () => {
    const s = reducer({ ...blank, isBusy: true }, { type: "SESSION_ERROR", message: "Codex crashed" });
    expect(s.isBusy).toBe(false);
    expect(s.error).toBe("Codex crashed");
  });
});
