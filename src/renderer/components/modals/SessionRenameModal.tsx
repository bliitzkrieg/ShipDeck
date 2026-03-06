interface SessionRenameModalProps {
  title: string;
  error: string | null;
  setTitle: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  heading?: string;
  description?: string;
  inputLabel?: string;
  placeholder?: string;
}

export function SessionRenameModal({
  title,
  error,
  setTitle,
  onClose,
  onSubmit,
  heading = "Rename Session",
  description = "Use a concise title so terminal tabs remain readable.",
  inputLabel = "Title",
  placeholder = "Session title"
}: SessionRenameModalProps): JSX.Element {
  return (
    <div className="modal-backdrop">
      <section className="modal-card">
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <header className="modal-head">
            <h3>{heading}</h3>
            <p>{description}</p>
          </header>
          {error ? <div className="panel-error">{error}</div> : null}
          <label>
            {inputLabel}
            <input
              className="session-rename-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              Save
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
