import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import {
  PART_CATEGORIES,
  type Bike,
  type Part,
  type PartCategory,
  type PartFormInput,
  type PartStatus,
} from '../types';

interface PartModalProps {
  part: Part | null;
  bikes: Bike[];
  defaultBikeId?: string | null;
  onSave: (input: PartFormInput, partId?: string) => Promise<void>;
  onClose: () => void;
}

export function PartModal({
  part,
  bikes,
  defaultBikeId = null,
  onSave,
  onClose,
}: PartModalProps) {
  const [name, setName] = useState(part?.name ?? '');
  const [brand, setBrand] = useState(part?.brand ?? '');
  const [category, setCategory] = useState<PartCategory>(
    part?.category ?? 'Antrieb',
  );
  const [specs, setSpecs] = useState(part?.specs ?? '');
  const [serialNumber, setSerialNumber] = useState(part?.serialNumber ?? '');
  const [status, setStatus] = useState<PartStatus>(
    part?.status ?? (defaultBikeId ? 'in_use' : 'in_stock'),
  );
  const [bikeId, setBikeId] = useState<string>(
    part?.bikeId ?? defaultBikeId ?? (bikes[0]?.id || ''),
  );
  const [notes, setNotes] = useState(part?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Bitte eine Teilebezeichnung angeben.');
      return;
    }
    if (status === 'in_use' && !bikeId) {
      setError('Für Teile mit Status „In Verwendung“ muss ein Bike gewählt werden.');
      return;
    }

    setBusy(true);
    try {
      await onSave(
        {
          name: name.trim(),
          brand: brand.trim(),
          category,
          specs: specs.trim(),
          serialNumber: serialNumber.trim(),
          status,
          bikeId: status === 'in_use' ? bikeId : null,
          notes: notes.trim(),
        },
        part?.id,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="modal-header">
          <h2 className="modal-title">
            {part ? 'Teil bearbeiten' : 'Neues Teil anlegen'}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Schließen"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field full">
              <label className="form-label" htmlFor="part-name">
                Bezeichnung *
              </label>
              <input
                id="part-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. SRAM Code R Bremsbeläge"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="part-brand">
                Hersteller
              </label>
              <input
                id="part-brand"
                className="input"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="z. B. SRAM"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="part-category">
                Kategorie
              </label>
              <select
                id="part-category"
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value as PartCategory)}
              >
                {PART_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="part-status">
                Status
              </label>
              <select
                id="part-status"
                className="select"
                value={status}
                onChange={(e) => {
                  const nextStatus = e.target.value as PartStatus;
                  setStatus(nextStatus);
                  if (nextStatus === 'in_use' && !bikeId && bikes[0]) {
                    setBikeId(bikes[0].id);
                  }
                }}
              >
                <option value="in_use">In Verwendung</option>
                <option value="in_stock">Im Lager</option>
                <option value="defective">Defekt</option>
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="part-bike">
                Verbaut in Bike {status === 'in_use' ? '*' : ''}
              </label>
              <select
                id="part-bike"
                className="select"
                value={status === 'in_use' ? bikeId : ''}
                disabled={status !== 'in_use'}
                onChange={(e) => setBikeId(e.target.value)}
              >
                {status !== 'in_use' ? (
                  <option value="">Nicht verbaut</option>
                ) : bikes.length === 0 ? (
                  <option value="">Kein Bike vorhanden</option>
                ) : (
                  bikes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="form-field full">
              <label className="form-label" htmlFor="part-specs">
                Spezifikation
              </label>
              <input
                id="part-specs"
                className="input"
                value={specs}
                onChange={(e) => setSpecs(e.target.value)}
                placeholder="z. B. 12-fach, 11–50 Zähne"
              />
            </div>

            <div className="form-field full">
              <label className="form-label" htmlFor="part-serial">
                Seriennummer (optional)
              </label>
              <input
                id="part-serial"
                className="input mono"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="Konkrete Teile-Seriennummer"
              />
            </div>

            <div className="form-field full">
              <label className="form-label" htmlFor="part-notes">
                Notizen
              </label>
              <textarea
                id="part-notes"
                className="textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
