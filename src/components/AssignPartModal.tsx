import { useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import {
  PART_CATEGORIES,
  type Bike,
  type Part,
  type PartCategory,
  type PartFormInput,
} from '../types';
import { ImageField } from './ImageField';

interface AssignPartModalProps {
  bike: Bike;
  stockParts: Part[];
  onAssignExisting: (part: Part, bikeId: string) => Promise<void>;
  onCreateForBike: (input: PartFormInput) => Promise<void>;
  onClose: () => void;
}

export function AssignPartModal({
  bike,
  stockParts,
  onAssignExisting,
  onCreateForBike,
  onClose,
}: AssignPartModalProps) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    stockParts.length > 0 ? 'existing' : 'new',
  );
  const [selectedPartId, setSelectedPartId] = useState(stockParts[0]?.id ?? '');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<PartCategory>('Antrieb');
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [specs, setSpecs] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [manufacturerUrl, setManufacturerUrl] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedPart = useMemo(
    () => stockParts.find((p) => p.id === selectedPartId) ?? null,
    [stockParts, selectedPartId],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'existing') {
        if (!selectedPart) {
          setError('Bitte ein Lager-Teil auswählen.');
          setBusy(false);
          return;
        }
        await onAssignExisting(selectedPart, bike.id);
      } else {
        if (!name.trim()) {
          setError('Bitte eine Teilebezeichnung angeben.');
          setBusy(false);
          return;
        }
        const parsedQty = Number(quantity);
        if (!Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > 999) {
          setError('Menge muss eine ganze Zahl zwischen 1 und 999 sein.');
          setBusy(false);
          return;
        }
        await onCreateForBike({
          name: name.trim(),
          brand: brand.trim(),
          category,
          subCategory: '',
          partNumber: partNumber.trim(),
          quantity: parsedQty,
          specs: specs.trim(),
          structuredSpecs: [],
          manufacturerUrl: manufacturerUrl.trim(),
          imageUrl: imageUrl.trim(),
          serialNumber: serialNumber.trim(),
          status: 'in_use',
          bikeId: bike.id,
          notes: notes.trim(),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zuordnung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="modal-header">
          <h2 className="modal-title">Teil für {bike.name}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Schließen"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn ${mode === 'existing' ? 'active' : ''}`}
            onClick={() => setMode('existing')}
          >
            Aus Lager zuordnen ({stockParts.length})
          </button>
          <button
            type="button"
            className={`segmented-btn ${mode === 'new' ? 'active' : ''}`}
            onClick={() => setMode('new')}
          >
            Neues Teil verbauen
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'existing' ? (
            <div className="form-field">
              <label className="form-label" htmlFor="stock-part-select">
                Verfügbares Teil im Lager
              </label>
              {stockParts.length === 0 ? (
                <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                  Aktuell befinden sich keine Teile mit Status „Im Lager“ im Bestand.
                </p>
              ) : (
                <select
                  id="stock-part-select"
                  className="select"
                  value={selectedPartId}
                  onChange={(e) => setSelectedPartId(e.target.value)}
                >
                  {stockParts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.name}
                      {part.brand ? ` (${part.brand})` : ''} — {part.category}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="form-grid">
              <ImageField
                label="Produktbild"
                value={imageUrl}
                onChange={setImageUrl}
              />

              <div className="form-field full">
                <label className="form-label" htmlFor="assign-part-name">
                  Bezeichnung *
                </label>
                <input
                  id="assign-part-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Maxxis Assegai 29x2.5"
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="assign-part-brand">
                  Hersteller
                </label>
                <input
                  id="assign-part-brand"
                  className="input"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="assign-part-category">
                  Kategorie
                </label>
                <select
                  id="assign-part-category"
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
                <label className="form-label" htmlFor="assign-part-number">
                  Teilenummer (optional)
                </label>
                <input
                  id="assign-part-number"
                  className="input mono"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="assign-part-qty">
                  Stückzahl
                </label>
                <input
                  id="assign-part-qty"
                  type="number"
                  min={1}
                  max={999}
                  className="input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <div className="form-field full">
                <label className="form-label" htmlFor="assign-part-specs">
                  Spezifikation
                </label>
                <input
                  id="assign-part-specs"
                  className="input"
                  value={specs}
                  onChange={(e) => setSpecs(e.target.value)}
                />
              </div>

              <div className="form-field full">
                <label className="form-label" htmlFor="assign-part-url">
                  Herstellerseite (optional)
                </label>
                <input
                  id="assign-part-url"
                  type="url"
                  className="input"
                  value={manufacturerUrl}
                  onChange={(e) => setManufacturerUrl(e.target.value)}
                />
              </div>

              <div className="form-field full">
                <label className="form-label" htmlFor="assign-part-serial">
                  Seriennummer (optional)
                </label>
                <input
                  id="assign-part-serial"
                  className="input mono"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                />
              </div>

              <div className="form-field full">
                <label className="form-label" htmlFor="assign-part-notes">
                  Notizen
                </label>
                <textarea
                  id="assign-part-notes"
                  className="textarea"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || (mode === 'existing' && stockParts.length === 0)}
            >
              {busy ? 'Speichert...' : 'Zuordnen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
