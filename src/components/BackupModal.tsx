import { Download, Upload, X } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import type { StorageMode } from '../api';
import type { Bike, OrderItem, Part } from '../types';
import { validateBackupPayload, type ValidatedBackupPayload } from '../validation';

const MAX_BACKUP_FILE_BYTES = 2 * 1024 * 1024;

interface BackupModalProps {
  bikes: Bike[];
  parts: Part[];
  orderItems: OrderItem[];
  storageMode: StorageMode;
  onImport: (payload: unknown) => Promise<void>;
  onExportSuccess: () => void;
  onClose: () => void;
}

export function BackupModal({
  bikes,
  parts,
  orderItems,
  storageMode,
  onImport,
  onExportSuccess,
  onClose,
}: BackupModalProps) {
  const [selectedFileName, setSelectedFileName] = useState('');
  const [parsedPayload, setParsedPayload] = useState<unknown | null>(null);
  const [preview, setPreview] = useState<ValidatedBackupPayload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function handleExport() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      bikes,
      parts,
      orderItems,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dateSlug = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bike-archiv-backup-${dateSlug}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onExportSuccess();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError('');
    setParsedPayload(null);
    setPreview(null);

    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFileName('');
      return;
    }

    setSelectedFileName(file.name);
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setError('Die ausgewählte Backup-Datei ist größer als 2 MB.');
      return;
    }

    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const validated = validateBackupPayload(raw);
      setParsedPayload(raw);
      setPreview(validated);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Die Datei enthält kein gültiges JSON-Format.');
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Die Backup-Datei konnte nicht gelesen werden.',
        );
      }
    }
  }

  async function handleConfirmImport() {
    if (!parsedPayload) return;
    setError('');
    setBusy(true);
    try {
      await onImport(parsedPayload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Backup konnte nicht importiert werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title">
      <div className="modal-panel">
        <div className="modal-header">
          <h2 id="backup-modal-title" className="modal-title">
            Backup
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Schließen"
            onClick={onClose}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="backup-meta">
          <div>
            <span className="backup-meta-label">Speicherort</span>
            <strong>{storageMode === 'server' ? 'Server-Datenbank' : 'Browser (lokal)'}</strong>
          </div>
          <div>
            <span className="backup-meta-label">Aktueller Bestand</span>
            <strong>
              {bikes.length} {bikes.length === 1 ? 'Bike' : 'Bikes'} · {parts.length}{' '}
              {parts.length === 1 ? 'Teil' : 'Teile'} · {orderItems.length}{' '}
              {orderItems.length === 1 ? 'Bestellposten' : 'Bestellposten'}
            </strong>
          </div>
        </div>

        <div className="backup-section">
          <h3 className="backup-section-title">Exportieren</h3>
          <p className="backup-section-text">
            Lädt den gesamten Bestand als JSON-Datei herunter.
          </p>
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} />
            <span>JSON-Backup herunterladen</span>
          </button>
        </div>

        <div className="backup-section">
          <h3 className="backup-section-title">Importieren</h3>
          <p className="backup-section-text">
            Ersetzt den aktuellen Bestand durch die Daten aus einer JSON-Backup-Datei.
          </p>

          <label className="backup-file-input">
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleFileChange(e)}
              disabled={busy}
            />
          </label>

          {preview && (
            <div className="backup-preview">
              <span>
                Datei <strong>{selectedFileName}</strong> geprüft:{' '}
                {preview.bikes.length} {preview.bikes.length === 1 ? 'Bike' : 'Bikes'},{' '}
                {preview.parts.length} {preview.parts.length === 1 ? 'Teil' : 'Teile'},{' '}
                {preview.orderItems.length} Bestellposten.
              </span>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Schließen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleConfirmImport()}
            disabled={!preview || busy}
          >
            <Upload size={15} />
            <span>{busy ? 'Wird importiert...' : 'Importieren & Bestand ersetzen'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
