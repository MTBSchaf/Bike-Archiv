import { useState, type FormEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { Bike, BikeFormInput } from '../types';

interface BikeModalProps {
  bike: Bike | null;
  onSave: (input: BikeFormInput, bikeId?: string) => Promise<void>;
  onClose: () => void;
}

interface DraftSerial {
  label: string;
  serialNumber: string;
  notes: string;
}

export function BikeModal({ bike, onSave, onClose }: BikeModalProps) {
  const isEditing = Boolean(bike);
  const [brand, setBrand] = useState(bike?.brand ?? '');
  const [model, setModel] = useState(bike?.model ?? '');
  const [name, setName] = useState(bike?.name ?? '');
  const [modelYear, setModelYear] = useState(bike?.modelYear ? String(bike.modelYear) : '');
  const [category, setCategory] = useState(bike?.category ?? 'Enduro / Trail');
  const [frameSize, setFrameSize] = useState(bike?.frameSize ?? '');
  const [wheelSize, setWheelSize] = useState(bike?.wheelSize ?? '');
  const [color, setColor] = useState(bike?.color ?? '');
  const [serialNumber, setSerialNumber] = useState(bike?.serialNumber ?? '');
  const [notes, setNotes] = useState(bike?.notes ?? '');
  const [extraSerials, setExtraSerials] = useState<DraftSerial[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function addDraftSerial() {
    setExtraSerials((prev) => [
      ...prev,
      { label: '', serialNumber: '', notes: '' },
    ]);
  }

  function updateDraftSerial(index: number, patch: Partial<DraftSerial>) {
    setExtraSerials((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeDraftSerial(index: number) {
    setExtraSerials((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!brand.trim() || !model.trim()) {
      setError('Marke und Modell sind erforderlich.');
      return;
    }

    const filteredSerials = extraSerials.filter(
      (s) => s.label.trim() || s.serialNumber.trim(),
    );
    for (const s of filteredSerials) {
      if (!s.label.trim() || !s.serialNumber.trim()) {
        setError('Jede zusätzliche Seriennummer benötigt Bezeichnung und Nummer.');
        return;
      }
    }

    setBusy(true);
    try {
      await onSave(
        {
          name: name.trim() || `${brand.trim()} ${model.trim()}`,
          brand: brand.trim(),
          model: model.trim(),
          modelYear: modelYear.trim() ? Number(modelYear.trim()) : null,
          category: category.trim() || 'MTB',
          frameSize: frameSize.trim(),
          wheelSize: wheelSize.trim(),
          color: color.trim(),
          serialNumber: serialNumber.trim(),
          notes: notes.trim(),
          ...(isEditing ? {} : { serials: filteredSerials }),
        },
        bike?.id,
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
            {isEditing ? 'Bike bearbeiten' : 'Neues Bike anlegen'}
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
            <div className="form-field">
              <label className="form-label" htmlFor="bike-brand">
                Marke *
              </label>
              <input
                id="bike-brand"
                className="input"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="z. B. Specialized"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="bike-model">
                Modell *
              </label>
              <input
                id="bike-model"
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="z. B. Status 160"
                required
              />
            </div>

            <div className="form-field full">
              <label className="form-label" htmlFor="bike-name">
                Anzeigename (optional)
              </label>
              <input
                id="bike-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Wird sonst aus Marke + Modell gebildet"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="bike-year">
                Modelljahr
              </label>
              <input
                id="bike-year"
                type="number"
                className="input"
                value={modelYear}
                onChange={(e) => setModelYear(e.target.value)}
                placeholder="z. B. 2022"
                min={1900}
                max={2100}
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="bike-category">
                Kategorie
              </label>
              <input
                id="bike-category"
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="z. B. Enduro / Trail"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="bike-frame-size">
                Rahmengröße
              </label>
              <input
                id="bike-frame-size"
                className="input"
                value={frameSize}
                onChange={(e) => setFrameSize(e.target.value)}
                placeholder="z. B. S3"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="bike-wheel-size">
                Laufradgröße
              </label>
              <input
                id="bike-wheel-size"
                className="input"
                value={wheelSize}
                onChange={(e) => setWheelSize(e.target.value)}
                placeholder='z. B. 29" / 27.5" Mullet'
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="bike-color">
                Farbe
              </label>
              <input
                id="bike-color"
                className="input"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="z. B. Satin Cast Umber"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="bike-serial">
                Rahmennummer
              </label>
              <input
                id="bike-serial"
                className="input mono"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="z. B. WSBC000000000"
              />
            </div>

            <div className="form-field full">
              <label className="form-label" htmlFor="bike-notes">
                Notizen
              </label>
              <textarea
                id="bike-notes"
                className="textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {!isEditing && (
              <div className="form-field full">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span className="form-label">Weitere Seriennummern (optional)</span>
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={addDraftSerial}
                  >
                    <Plus size={14} />
                    <span>Nummer hinzufügen</span>
                  </button>
                </div>

                {extraSerials.map((entry, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.2fr auto',
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <input
                      className="input"
                      placeholder="Bezeichnung (z. B. Gabel)"
                      value={entry.label}
                      onChange={(e) =>
                        updateDraftSerial(idx, { label: e.target.value })
                      }
                    />
                    <input
                      className="input mono"
                      placeholder="Seriennummer"
                      value={entry.serialNumber}
                      onChange={(e) =>
                        updateDraftSerial(idx, { serialNumber: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label="Entfernen"
                      onClick={() => removeDraftSerial(idx)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
