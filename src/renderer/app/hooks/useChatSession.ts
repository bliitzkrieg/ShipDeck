import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AgentEvent, SessionProvider } from "../../../shared/types";

export type ChatMessageRole = "user" | "assistant" | "thinking" | "plan" | "diff" | "error";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  streaming: boolean;
  timestamp: number;
}

export interface PendingApproval {
  requestId: string;
  method: string;
  detail: string;
}

export interface ChatSessionState {
  sessionId: string | null;
  terminalId: string | null;
  provider: SessionProvider | null;
  messages: ChatMessage[];
  pendingApprovals: PendingApproval[];
  isReady: boolean;
  isBusy: boolean;
  error: string | null;
}

type Action =
  | { type: "SET_TERMINAL"; terminalId: string | null; sessionId: string | null }
  | { type: "SESSION_READY"; provider: SessionProvider }
  | { type: "TURN_START" }
  | { type: "MESSAGE_DELTA"; delta: string; role: ChatMessageRole }
  | { type: "TURN_COMPLETE"; fullText: string }
  | { type: "TURN_ABORT"; reason: string }
  | { type: "APPROVAL_REQUEST"; request: PendingApproval }
  | { type: "APPROVAL_RESOLVED"; requestId: string }
  | { type: "SESSION_ERROR"; message: string }
  | { type: "APPEND_USER"; text: string }
  | { type: "CLEAR" };

let _msgCounter = 0;
function nextId(): string {
  _msgCounter += 1;
  return `msg-${Date.now()}-${_msgCounter}`;
}

const INITIAL_STATE: ChatSessionState = {
  sessionId: null,
  terminalId: null,
  provider: null,
  messages: [],
  pendingApprovals: [],
  isReady: false,
  isBusy: false,
  error: null
};

function reducer(state: ChatSessionState, action: Action): ChatSessionState {
  switch (action.type) {
    case "SET_TERMINAL":
      return {
        ...INITIAL_STATE,
        terminalId: action.terminalId,
        sessionId: action.sessionId
      };

    case "SESSION_READY":
      return { ...state, isReady: true, provider: action.provider, error: null };

    case "TURN_START":
      return { ...state, isBusy: true, error: null };

    case "MESSAGE_DELTA": {
      const last = state.messages[state.messages.length - 1];
      const isAppendable = last && last.role === action.role && last.streaming;
      if (isAppendable) {
        return {
          ...state,
          messages: [
            ...state.messages.slice(0, -1),
            { ...last, content: last.content + action.delta }
          ]
        };
      }
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: nextId(),
            role: action.role,
            content: action.delta,
            streaming: true,
            timestamp: Date.now()
          }
        ]
      };
    }

    case "TURN_COMPLETE": {
      // Seal any streaming messages
      return {
        ...state,
        isBusy: false,
        messages: state.messages.map((m) =>
          m.streaming ? { ...m, streaming: false } : m
        )
      };
    }

    case "TURN_ABORT":
      return {
        ...state,
        isBusy: false,
        error: action.reason,
        messages: state.messages.map((m) =>
          m.streaming ? { ...m, streaming: false } : m
        )
      };

    case "APPROVAL_REQUEST":
      return {
        ...state,
        pendingApprovals: [...state.pendingApprovals, action.request]
      };

    case "APPROVAL_RESOLVED":
      return {
        ...state,
        pendingApprovals: state.pendingApprovals.filter((a) => a.requestId !== action.requestId)
      };

    case "SESSION_ERROR":
      return {
        ...state,
        isBusy: false,
        error: action.message,
        messages: state.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m))
      };

    case "APPEND_USER":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: nextId(),
            role: "user",
            content: action.text,
            streaming: false,
            timestamp: Date.now()
          }
        ]
      };

    case "CLEAR":
      return { ...state, messages: [], error: null };

    default:
      return state;
  }
}

export interface ChatSessionActions {
  sendTurn: (text: string) => Promise<void>;
  interrupt: () => Promise<void>;
  approve: (requestId: string, decision: "accept" | "acceptForSession" | "decline") => Promise<void>;
}

export function useChatSession(
  terminalId: string | null,
  sessionId: string | null
): [ChatSessionState, ChatSessionActions] {
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL_STATE,
    terminalId,
    sessionId
  });

  const terminalIdRef = useRef(terminalId);
  const sessionIdRef = useRef(sessionId);

  // Reset state when the active session/terminal changes.
  useEffect(() => {
    if (terminalId !== terminalIdRef.current || sessionId !== sessionIdRef.current) {
      terminalIdRef.current = terminalId;
      sessionIdRef.current = sessionId;
      dispatch({ type: "SET_TERMINAL", terminalId, sessionId });
    }
  }, [terminalId, sessionId]);

  // Subscribe to agent events from main process.
  useEffect(() => {
    const unsubscribe = window.api.agent.onEvent((event: AgentEvent) => {
      if (event.terminalId !== terminalIdRef.current) {
        return;
      }

      switch (event.kind) {
        case "session.ready":
          dispatch({ type: "SESSION_READY", provider: event.provider });
          break;
        case "turn.start":
          dispatch({ type: "TURN_START" });
          break;
        case "message.delta":
          dispatch({ type: "MESSAGE_DELTA", delta: event.delta, role: "assistant" });
          break;
        case "thinking.delta":
          dispatch({ type: "MESSAGE_DELTA", delta: event.delta, role: "thinking" });
          break;
        case "plan.delta":
          dispatch({ type: "MESSAGE_DELTA", delta: event.delta, role: "plan" });
          break;
        case "diff.update":
          dispatch({ type: "MESSAGE_DELTA", delta: event.patch, role: "diff" });
          break;
        case "approval.request":
          dispatch({
            type: "APPROVAL_REQUEST",
            request: { requestId: event.requestId, method: event.method, detail: event.detail }
          });
          break;
        case "approval.resolved":
          dispatch({ type: "APPROVAL_RESOLVED", requestId: event.requestId });
          break;
        case "turn.complete":
          dispatch({ type: "TURN_COMPLETE", fullText: event.fullText });
          break;
        case "turn.abort":
          dispatch({ type: "TURN_ABORT", reason: event.reason });
          break;
        case "session.error":
          dispatch({ type: "SESSION_ERROR", message: event.message });
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, []);

  const sendTurn = useCallback(async (text: string): Promise<void> => {
    const tid = terminalIdRef.current;
    if (!tid) {
      return;
    }
    dispatch({ type: "APPEND_USER", text });
    await window.api.agent.sendTurn({ terminalId: tid, text });
  }, []);

  const interrupt = useCallback(async (): Promise<void> => {
    const tid = terminalIdRef.current;
    if (!tid) {
      return;
    }
    await window.api.agent.interrupt({ terminalId: tid });
  }, []);

  const approve = useCallback(
    async (requestId: string, decision: "accept" | "acceptForSession" | "decline"): Promise<void> => {
      const tid = terminalIdRef.current;
      if (!tid) {
        return;
      }
      dispatch({ type: "APPROVAL_RESOLVED", requestId });
      await window.api.agent.approve({ terminalId: tid, requestId, decision });
    },
    []
  );

  return [state, { sendTurn, interrupt, approve }];
}
