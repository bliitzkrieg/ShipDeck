import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Send, Square, XCircle } from "lucide-react";
import { useChatSession } from "../app/hooks/useChatSession";
import type { ChatMessage, ChatMessageRole, PendingApproval } from "../app/hooks/useChatSession";
import type { Session } from "../../shared/types";

interface SessionChatPanelProps {
  terminalId: string | null;
  session: Session | null;
}

export const SessionChatPanel = memo(function SessionChatPanel({
  terminalId,
  session
}: SessionChatPanelProps): JSX.Element {
  const [state, actions] = useChatSession(terminalId, session?.id ?? null);
  const [input, setInput] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth"): void => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useLayoutEffect(() => {
    if (isAtBottom) {
      scrollToBottom("instant");
    }
  }, [state.messages, isAtBottom, scrollToBottom]);

  useEffect(() => {
    scrollToBottom("instant");
  }, [terminalId, scrollToBottom]);

  const handleScroll = useCallback((): void => {
    const el = messagesContainerRef.current;
    if (!el) {
      return;
    }
    const threshold = 60;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }, []);

  const handleSend = useCallback(async (): Promise<void> => {
    const text = input.trim();
    if (!text || state.isBusy || !state.isReady) {
      return;
    }
    setInput("");
    autoResizeTextarea(textareaRef.current);
    await actions.sendTurn(text);
  }, [actions, input, state.isBusy, state.isReady]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(event.target.value);
    autoResizeTextarea(event.target);
  }, []);

  const canSend = input.trim().length > 0 && state.isReady && !state.isBusy;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <span className="chat-provider-badge" data-provider={session?.provider ?? "unknown"}>
            {providerLabel(session?.provider)}
          </span>
          {session?.title ? <span className="chat-session-title">{session.title}</span> : null}
        </div>
        <div className="chat-header-status">
          {!state.isReady ? (
            <span className="chat-status connecting">
              <Loader2 size={12} className="spin" />
              Connecting…
            </span>
          ) : state.isBusy ? (
            <span className="chat-status busy">
              <Loader2 size={12} className="spin" />
              Thinking…
            </span>
          ) : (
            <span className="chat-status ready">
              <span className="chat-status-dot" />
              Ready
            </span>
          )}
          {state.isBusy ? (
            <button
              type="button"
              className="chat-interrupt-btn"
              onClick={() => void actions.interrupt()}
              title="Interrupt"
            >
              <Square size={12} />
              Stop
            </button>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div
        className="chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {state.messages.length === 0 && state.isReady ? (
          <div className="chat-empty">
            <p>Send a message to start coding with {providerLabel(session?.provider)}.</p>
          </div>
        ) : !state.isReady ? (
          <div className="chat-empty">
            <Loader2 size={20} className="spin" />
            <p>Starting session…</p>
          </div>
        ) : null}

        {state.messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {state.isBusy && !state.messages.some((m) => m.streaming) ? (
          <div className="chat-thinking-indicator">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {state.error ? (
          <div className="chat-error-banner">
            <AlertCircle size={14} />
            {state.error}
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {/* Approval requests */}
      {state.pendingApprovals.length > 0 ? (
        <div className="chat-approvals">
          {state.pendingApprovals.map((approval) => (
            <ApprovalRequest key={approval.requestId} approval={approval} onResolve={actions.approve} />
          ))}
        </div>
      ) : null}

      {/* Scroll-to-bottom button */}
      {!isAtBottom ? (
        <button
          type="button"
          className="chat-scroll-btn"
          onClick={() => {
            setIsAtBottom(true);
            scrollToBottom();
          }}
        >
          <ChevronDown size={14} />
        </button>
      ) : null}

      {/* Composer */}
      <div className="chat-composer">
        <textarea
          ref={textareaRef}
          className="chat-composer-input"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={state.isReady ? "Message… (Enter to send, Shift+Enter for newline)" : "Connecting…"}
          disabled={!state.isReady}
          rows={1}
        />
        <button
          type="button"
          className="chat-send-btn"
          onClick={() => void handleSend()}
          disabled={!canSend}
          title="Send"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
});

// ─── ChatBubble ─────────────────────────────────────────────────────────────

interface ChatBubbleProps {
  message: ChatMessage;
}

function ChatBubble({ message }: ChatBubbleProps): JSX.Element {
  const isUser = message.role === "user";

  return (
    <div className={`chat-bubble-row ${isUser ? "user" : "assistant"}`}>
      {!isUser ? <RoleIcon role={message.role} /> : null}
      <div className={`chat-bubble ${message.role}`}>
        <BubbleContent message={message} />
        {message.streaming ? <span className="chat-cursor" /> : null}
      </div>
    </div>
  );
}

function RoleIcon({ role }: { role: ChatMessageRole }): JSX.Element | null {
  switch (role) {
    case "thinking":
      return <span className="chat-role-icon thinking" title="Thinking" />;
    case "plan":
      return <span className="chat-role-icon plan" title="Plan" />;
    case "diff":
      return <span className="chat-role-icon diff" title="Diff" />;
    default:
      return null;
  }
}

function BubbleContent({ message }: { message: ChatMessage }): JSX.Element {
  if (message.role === "diff") {
    return (
      <div className="chat-bubble-diff">
        <div className="chat-bubble-diff-header">
          <span>File changes</span>
        </div>
        <pre className="chat-bubble-diff-body">{message.content}</pre>
      </div>
    );
  }

  if (message.role === "thinking") {
    return (
      <details className="chat-thinking-block">
        <summary>Reasoning</summary>
        <p className="chat-thinking-body">{message.content}</p>
      </details>
    );
  }

  if (message.role === "plan") {
    return (
      <div className="chat-plan-block">
        <div className="chat-plan-header">Plan</div>
        <pre className="chat-plan-body">{message.content}</pre>
      </div>
    );
  }

  return <p className="chat-bubble-text">{message.content}</p>;
}

// ─── ApprovalRequest ─────────────────────────────────────────────────────────

interface ApprovalRequestProps {
  approval: PendingApproval;
  onResolve: (requestId: string, decision: "accept" | "acceptForSession" | "decline") => Promise<void>;
}

function ApprovalRequest({ approval, onResolve }: ApprovalRequestProps): JSX.Element {
  const [resolving, setResolving] = useState(false);

  const handle = async (decision: "accept" | "acceptForSession" | "decline"): Promise<void> => {
    setResolving(true);
    await onResolve(approval.requestId, decision);
  };

  const label = approval.method
    .replace("item/", "")
    .replace("/requestApproval", "")
    .replace(/([A-Z])/g, " $1")
    .trim();

  return (
    <div className="chat-approval-card">
      <div className="chat-approval-header">
        <AlertCircle size={13} />
        <span>Approval needed: {label}</span>
      </div>
      <p className="chat-approval-detail">{approval.detail}</p>
      <div className="chat-approval-actions">
        <button
          type="button"
          className="chat-approval-btn accept"
          onClick={() => void handle("accept")}
          disabled={resolving}
        >
          <CheckCircle2 size={12} />
          Allow once
        </button>
        <button
          type="button"
          className="chat-approval-btn accept-session"
          onClick={() => void handle("acceptForSession")}
          disabled={resolving}
        >
          <CheckCircle2 size={12} />
          Allow always
        </button>
        <button
          type="button"
          className="chat-approval-btn deny"
          onClick={() => void handle("decline")}
          disabled={resolving}
        >
          <XCircle size={12} />
          Deny
        </button>
      </div>
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function providerLabel(provider: string | undefined): string {
  switch (provider) {
    case "codex": return "Codex";
    case "claude": return "Claude";
    case "opencode": return "OpenCode";
    default: return "Agent";
  }
}

function autoResizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  const max = 200;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}
