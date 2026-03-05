interface SessionProviderModalProps {
  rememberSessionProviderChoice: boolean;
  setRememberSessionProviderChoice: (value: boolean) => void;
  onSelectClaude: () => void;
  onSelectCodex: () => void;
  onClose: () => void;
}

export function SessionProviderModal({
  rememberSessionProviderChoice,
  setRememberSessionProviderChoice,
  onSelectClaude,
  onSelectCodex,
  onClose
}: SessionProviderModalProps): JSX.Element {
  return (
    <div className="modal-backdrop">
      <section className="modal-card session-provider-modal">
        <h3>Choose Session Provider</h3>
        <p className="session-provider-help">Start a new CLI session with either Claude or Codex.</p>
        <div className="session-provider-actions">
          <button onClick={onSelectClaude}>Claude</button>
          <button onClick={onSelectCodex}>Codex</button>
        </div>
        <label className="session-provider-checkbox">
          <input
            type="checkbox"
            checked={rememberSessionProviderChoice}
            onChange={(event) => setRememberSessionProviderChoice(event.target.checked)}
          />
          Do not ask me again
        </label>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
