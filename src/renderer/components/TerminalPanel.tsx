import { memo, useCallback, useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

interface TerminalPanelProps {
  activeTerminalId: string | null;
}

const MAX_BUFFER_CHARS = 200_000;

export const TerminalPanel = memo(function TerminalPanel({ activeTerminalId }: TerminalPanelProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);
  const activeTerminalIdRef = useRef<string | null>(activeTerminalId);
  const terminalBuffersRef = useRef<Record<string, string>>({});
  const suppressInputForwardingRef = useRef(false);
  const suppressInputTimerRef = useRef<number | null>(null);

  const appendToBuffer = useCallback((terminalId: string, chunk: string): void => {
    const current = terminalBuffersRef.current[terminalId] ?? "";
    const next = `${current}${chunk}`;
    terminalBuffersRef.current[terminalId] =
      next.length > MAX_BUFFER_CHARS ? next.slice(next.length - MAX_BUFFER_CHARS) : next;
  }, []);

  const renderActiveBuffer = useCallback((): void => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    terminal.reset();
    const terminalId = activeTerminalIdRef.current;
    if (!terminalId) {
      terminal.writeln("Select a terminal tab to begin.");
      return;
    }
    const buffered = terminalBuffersRef.current[terminalId] ?? "";
    if (buffered) {
      // Replaying historical output can contain ANSI queries that cause xterm
      // to emit synthetic responses. Do not forward those to the backend.
      suppressInputForwardingRef.current = true;
      if (suppressInputTimerRef.current !== null) {
        window.clearTimeout(suppressInputTimerRef.current);
      }
      terminal.write(buffered, () => {
        suppressInputTimerRef.current = window.setTimeout(() => {
          suppressInputForwardingRef.current = false;
          suppressInputTimerRef.current = null;
        }, 30);
      });
    }
  }, []);

  const copyTerminalSelection = async (): Promise<void> => {
    const text = terminalRef.current?.getSelection() ?? "";
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.focus();
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
  };

  const pasteFromClipboard = async (): Promise<void> => {
    const terminalId = activeTerminalIdRef.current;
    if (!terminalId) {
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text.length > 0) {
        window.api.terminals.writeInput({ terminalId, data: text });
      }
    } catch {
      // Ignore clipboard failures in restricted environments.
    }
  };

  const getSafeDimensions = (fitAddon: FitAddon): { cols: number; rows: number } | null => {
    if (!mountedRef.current || !containerRef.current?.isConnected || !terminalRef.current) {
      return null;
    }
    try {
      return fitAddon.proposeDimensions() ?? null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    activeTerminalIdRef.current = activeTerminalId;
    renderActiveBuffer();
    const fitAddon = fitAddonRef.current;
    if (!fitAddon) {
      return;
    }
    const dims = getSafeDimensions(fitAddon);
    if (dims && activeTerminalId) {
      const terminal = terminalRef.current;
      if (terminal && (terminal.cols !== dims.cols || terminal.rows !== dims.rows)) {
        terminal.resize(dims.cols, dims.rows);
      }
      void window.api.terminals.resize({
        terminalId: activeTerminalId,
        cols: dims.cols,
        rows: dims.rows
      });
    }
  }, [activeTerminalId, renderActiveBuffer]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    mountedRef.current = true;

    const computed = getComputedStyle(document.documentElement);
    const terminalBackground = computed.getPropertyValue("--surface-2").trim() || "#12171d";
    const terminalForeground = computed.getPropertyValue("--text-0").trim() || "#dfe6ee";
    const terminalCursor = computed.getPropertyValue("--accent-0").trim() || "#7cc6ff";

    const terminal = new Terminal({
      convertEol: true,
      fontFamily: '"IBM Plex Mono", "Cascadia Mono", "Consolas", monospace',
      theme: {
        background: terminalBackground,
        foreground: terminalForeground,
        cursor: terminalCursor,
        selectionBackground: "rgba(124, 198, 255, 0.25)"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    renderActiveBuffer();

    const applyFit = (): void => {
      if (!mountedRef.current || !containerRef.current?.isConnected || !terminalRef.current) {
        return;
      }
      const dims = getSafeDimensions(fitAddon);
      if (!dims) {
        return;
      }
      if (terminal.cols !== dims.cols || terminal.rows !== dims.rows) {
        terminal.resize(dims.cols, dims.rows);
      }
      const terminalId = activeTerminalIdRef.current;
      if (dims && terminalId) {
        void window.api.terminals.resize({
          terminalId,
          cols: dims.cols,
          rows: dims.rows
        });
      }
    };
    const fitFrameId = requestAnimationFrame(() => applyFit());
    const resizeObserver = new ResizeObserver(() => applyFit());
    resizeObserver.observe(containerRef.current);

    terminal.attachCustomKeyEventHandler((event) => {
      const lower = event.key.toLowerCase();
      const isCopyShortcut =
        event.type === "keydown" &&
        event.shiftKey &&
        lower === "c" &&
        (event.ctrlKey || event.metaKey);
      if (isCopyShortcut) {
        void copyTerminalSelection();
        event.preventDefault();
        return false;
      }
      const isPasteShortcut =
        event.type === "keydown" &&
        event.shiftKey &&
        lower === "v" &&
        (event.ctrlKey || event.metaKey);
      if (isPasteShortcut) {
        void pasteFromClipboard();
        event.preventDefault();
        return false;
      }
      return true;
    });

    const unsubscribeInput = terminal.onData((data) => {
      if (suppressInputForwardingRef.current) {
        return;
      }
      const terminalId = activeTerminalIdRef.current;
      if (!terminalId) {
        return;
      }
      window.api.terminals.writeInput({ terminalId, data });
    });

    const unsubscribeData = window.api.terminals.onData(({ terminalId, data }) => {
      appendToBuffer(terminalId, data);
      if (activeTerminalIdRef.current && terminalId === activeTerminalIdRef.current) {
        const current = terminalRef.current;
        if (mountedRef.current && current === terminal) {
          current.write(data);
        }
      }
    });

    const unsubscribeExit = window.api.terminals.onExit(({ terminalId, code }) => {
      const message = `\r\n[process exited with code ${code}]`;
      appendToBuffer(terminalId, message);
      if (
        mountedRef.current &&
        terminalRef.current === terminal &&
        activeTerminalIdRef.current &&
        terminalId === activeTerminalIdRef.current
      ) {
        terminal.write(message);
      }
    });

    return () => {
      mountedRef.current = false;
      suppressInputForwardingRef.current = false;
      if (suppressInputTimerRef.current !== null) {
        window.clearTimeout(suppressInputTimerRef.current);
        suppressInputTimerRef.current = null;
      }
      cancelAnimationFrame(fitFrameId);
      unsubscribeInput.dispose();
      unsubscribeData();
      unsubscribeExit();
      resizeObserver.disconnect();
      fitAddonRef.current = null;
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [appendToBuffer, renderActiveBuffer]);

  return (
    <div
      className="terminal-panel terminal-host"
      ref={containerRef}
      onClick={() => terminalRef.current?.focus()}
      onContextMenu={(event) => {
        event.preventDefault();
        void pasteFromClipboard();
      }}
    />
  );
});
