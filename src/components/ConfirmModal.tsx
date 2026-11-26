import { X } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Löschen',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmModalProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel narrow">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Schließen"
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{message}</p>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Wird ausgeführt...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
