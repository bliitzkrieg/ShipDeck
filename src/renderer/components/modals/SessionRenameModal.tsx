interface SessionRenameModalProps {
  title: string;
  error: string | null;
  setTitle: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function SessionRenameModal({ title, error, setTitle, onClose, onSubmit }: SessionRenameModalProps): JSX.Element {
  return (
    <div className="modal-backdrop">
      <section className="modal-card">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <h3>Rename Session</h3>
          {error ? <div className="panel-error">{error}</div> : null}
          <label>
            Title
            <input
              className="session-rename-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Session title"
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      </section>
    </div>
  );
}
