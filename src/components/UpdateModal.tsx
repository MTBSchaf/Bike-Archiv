import { CheckCircle2, Copy, Download, RefreshCw, Upload, X } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import type { ApplyUpdateResponse, SystemStatus, UpdateCheckResult } from '../types';
import { validateUpdatePackagePreview, type ValidatedUpdatePackagePreview } from '../validation';

const MAX_UPDATE_FILE_BYTES = 4 * 1024 * 1024;

interface UpdateModalProps {
  systemStatus: SystemStatus | null;
  onCheckRemote: () => Promise<UpdateCheckResult>;
  onApplyCatalog: () => Promise<ApplyUpdateResponse>;
  onApplyPackage: (pkg: unknown) => Promise<ApplyUpdateResponse>;
  onCopyCommand: (cmd: string) => void;
  onClose: () => void;
}

export function UpdateModal({
  systemStatus,
  onCheckRemote,
  onApplyCatalog,
  onApplyPackage,
  onCopyCommand,
  onClose,
}: UpdateModalProps) {
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgPayload, setPkgPayload] = useState<unknown | null>(null);
  const [pkgPreview, setPkgPreview] = useState<ValidatedUpdatePackagePreview | null>(null);
  const [pkgFileName, setPkgFileName] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  async function handleCheckRemote() {
    setError('');
    setStatusMessage('');
    setChecking(true);
    try {
      const res = await onCheckRemote();
      setCheckResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update-Prüfung fehlgeschlagen.');
    } finally {
      setChecking(false);
    }
  }

  async function handleSyncCatalog() {
    setError('');
    setStatusMessage('');
    setCatalogBusy(true);
    try {
      const res = await onApplyCatalog();
      setStatusMessage(
        `Katalog synchronisiert (${res.result.partsAdded ?? 0} neu, ${res.result.partsUpdated ?? 0} aktualisiert).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Katalog-Synchronisierung fehlgeschlagen.');
    } finally {
      setCatalogBusy(false);
    }
  }

  async function handlePackageFile(event: ChangeEvent<HTMLInputElement>) {
    setError('');
    setStatusMessage('');
    setPkgPayload(null);
    setPkgPreview(null);
    const file = event.target.files?.[0];
    if (!file) {
      setPkgFileName('');
      return;
    }
    setPkgFileName(file.name);
    if (file.size > MAX_UPDATE_FILE_BYTES) {
      setError('Das Update-Paket darf maximal 4 MB groß sein.');
      return;
    }
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const preview = validateUpdatePackagePreview(raw);
      setPkgPayload(raw);
      setPkgPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update-Paket konnte nicht gelesen werden.');
    }
  }

  async function handleApplyPackage() {
    if (!pkgPayload) return;
    setError('');
    setStatusMessage('');
    setPkgBusy(true);
    try {
      const res = await onApplyPackage(pkgPayload);
      setPkgPayload(null);
      setPkgPreview(null);
      setPkgFileName('');
      setStatusMessage(
        `Update-Paket eingespielt: ${res.result.partsAdded ?? 0} Teile neu, ${res.result.partsUpdated ?? 0} aktualisiert.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update-Paket fehlgeschlagen.');
    } finally {
      setPkgBusy(false);
    }
  }

  const busy = checking || catalogBusy || pkgBusy;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
      <div className="modal-panel">
        <div className="modal-header">
          <h2 id="update-modal-title" className="modal-title">
            Updates &amp; Systemstand
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

        <div className="update-status-grid">
          <div>
            <span className="backup-meta-label">App-Version</span>
            <strong>v{systemStatus?.appVersion ?? '–'}</strong>
          </div>
          <div>
            <span className="backup-meta-label">Datenbank-Schema</span>
            <strong>v{systemStatus?.schemaVersion ?? '–'}</strong>
          </div>
          <div>
            <span className="backup-meta-label">Katalog-Stand</span>
            <strong>v{systemStatus?.catalogVersion ?? '–'}</strong>
          </div>
          <div>
            <span className="backup-meta-label">Git-Stand</span>
            <strong className="mono">
              {systemStatus?.git.available && systemStatus.git.commit
                ? `${systemStatus.git.branch}@${systemStatus.git.commit}`
                : 'Lokal'}
            </strong>
          </div>
        </div>

        <div className="backup-section">
          <h3 className="backup-section-title">System- &amp; Code-Update (Git / Proxmox)</h3>
          <p className="backup-section-text">
            Prüft auf neue Releases im Repository. Im Server- oder LXC-Betrieb spielt der Update-Befehl Änderungen inklusive Vorab-Backup automatisch ein.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void handleCheckRemote()}
            >
              <RefreshCw size={14} />
              <span>{checking ? 'Prüft...' : 'Nach Updates suchen'}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void handleSyncCatalog()}
            >
              <Download size={14} />
              <span>
                {catalogBusy
                  ? 'Synchronisiert...'
                  : 'Katalog-Update synchronisieren'}
              </span>
            </button>
          </div>

          {checkResult && (
            <div
              className={`update-banner ${
                checkResult.updateAvailable ? 'available' : checkResult.offline ? '' : 'current'
              }`}
            >
              <div>{checkResult.message}</div>
              <div className="update-cli-box">
                <span>{checkResult.updateCommand}</span>
                <button
                  type="button"
                  className="icon-btn"
                  title="Befehl kopieren"
                  aria-label="Update-Befehl kopieren"
                  onClick={() => onCopyCommand(checkResult.updateCommand)}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="backup-section">
          <h3 className="backup-section-title">Inkrementelles Update-Paket (.json)</h3>
          <p className="backup-section-text">
            Ergänzt oder aktualisiert Bikes, Komponenten, Bilder und technische Daten, ohne bestehende Seriennummern oder eigene Notizen zu überschreiben.
          </p>
          <label className="backup-file-input">
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handlePackageFile(e)}
              disabled={busy}
            />
          </label>
          {pkgPreview && (
            <div className="backup-preview">
              <strong>{pkgFileName}</strong> (v{pkgPreview.version} · {pkgPreview.updateId}):{' '}
              {pkgPreview.bikesCount} Bikes, {pkgPreview.partsCount} Teile,{' '}
              {pkgPreview.orderItemsCount} Bestellungen
            </div>
          )}
          {pkgPreview && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => void handleApplyPackage()}
              >
                <Upload size={14} />
                <span>{pkgBusy ? 'Spielt ein...' : 'Update-Paket einspielen'}</span>
              </button>
            </div>
          )}
        </div>

        {statusMessage && (
          <div className="backup-preview" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{statusMessage}</span>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="backup-section">
          <h3 className="backup-section-title">Update-Verlauf</h3>
          {!systemStatus || systemStatus.updateHistory.length === 0 ? (
            <p className="backup-section-text" style={{ marginBottom: 0 }}>
              Noch keine protokollierten Updates.
            </p>
          ) : (
            <div className="update-history-list">
              {systemStatus.updateHistory.map((entry) => (
                <div key={entry.id} className="update-history-item">
                  <div className="update-history-top">
                    <strong>
                      {entry.updateType.toUpperCase()} v{entry.version}
                    </strong>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(entry.appliedAt).toLocaleString('de-DE')}
                    </span>
                  </div>
                  <div>{entry.description}</div>
                  {entry.details && (
                    <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                      {entry.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
        </div>
      </div>
    </div>
  );
}
