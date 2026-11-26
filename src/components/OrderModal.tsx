import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import {
  PART_CATEGORIES,
  type Bike,
  type OrderFormInput,
  type OrderItem,
  type OrderPriority,
  type OrderStatus,
  type PartCategory,
} from '../types';

interface OrderModalProps {
  orderItem: OrderItem | null;
  prefill?: Partial<OrderFormInput> | null;
  bikes: Bike[];
  onSave: (input: OrderFormInput, orderId?: string) => Promise<void>;
  onClose: () => void;
}

export function OrderModal({
  orderItem,
  prefill = null,
  bikes,
  onSave,
  onClose,
}: OrderModalProps) {
  const [name, setName] = useState(orderItem?.name ?? prefill?.name ?? '');
  const [brand, setBrand] = useState(orderItem?.brand ?? prefill?.brand ?? '');
  const [category, setCategory] = useState<PartCategory>(
    orderItem?.category ?? prefill?.category ?? 'Sonstiges',
  );
  const [bikeId, setBikeId] = useState(orderItem?.bikeId ?? prefill?.bikeId ?? '');
  const [quantity, setQuantity] = useState(String(orderItem?.quantity ?? prefill?.quantity ?? 1));
  const [priority, setPriority] = useState<OrderPriority>(
    orderItem?.priority ?? prefill?.priority ?? 'normal',
  );
  const [estimatedPrice, setEstimatedPrice] = useState(
    orderItem?.estimatedPrice !== null && orderItem?.estimatedPrice !== undefined
      ? String(orderItem.estimatedPrice)
      : '',
  );
  const [shopUrl, setShopUrl] = useState(orderItem?.shopUrl ?? '');
  const [status, setStatus] = useState<OrderStatus>(orderItem?.status ?? 'open');
  const [notes, setNotes] = useState(orderItem?.notes ?? prefill?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Bitte eine Artikelbezeichnung angeben.');
      return;
    }

    const parsedQty = Number(quantity);
    if (!Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > 999) {
      setError('Menge muss zwischen 1 und 999 liegen.');
      return;
    }

    let parsedPrice: number | null = null;
    if (estimatedPrice.trim()) {
      const normalized = Number(estimatedPrice.trim().replace(',', '.'));
      if (!Number.isFinite(normalized) || normalized < 0) {
        setError('Bitte einen gültigen Preis eingeben.');
        return;
      }
      parsedPrice = Math.round(normalized * 100) / 100;
    }

    setBusy(true);
    try {
      await onSave(
        {
          name: name.trim(),
          brand: brand.trim(),
          category,
          bikeId: bikeId || null,
          partId: orderItem?.partId ?? prefill?.partId ?? null,
          quantity: parsedQty,
          priority,
          estimatedPrice: parsedPrice,
          shopUrl: shopUrl.trim(),
          status,
          notes: notes.trim(),
        },
        orderItem?.id,
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
            {orderItem ? 'Bestellposten bearbeiten' : 'Neuer Bestellposten'}
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
              <label className="form-label" htmlFor="order-name">
                Artikelbezeichnung *
              </label>
              <input
                id="order-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. SRAM NX Eagle Kette 12-fach"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="order-brand">
                Hersteller
              </label>
              <input
                id="order-brand"
                className="input"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="order-category">
                Kategorie
              </label>
              <select
                id="order-category"
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
              <label className="form-label" htmlFor="order-quantity">
                Menge
              </label>
              <input
                id="order-quantity"
                type="number"
                className="input"
                min={1}
                max={999}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="order-priority">
                Priorität
              </label>
              <select
                id="order-priority"
                className="select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as OrderPriority)}
              >
                <option value="high">Hoch</option>
                <option value="normal">Normal</option>
                <option value="low">Niedrig</option>
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="order-bike">
                Für Bike (optional)
              </label>
              <select
                id="order-bike"
                className="select"
                value={bikeId}
                onChange={(e) => setBikeId(e.target.value)}
              >
                <option value="">Allgemein / Lager</option>
                {bikes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="order-price">
                Geschätzter Stückpreis (€)
              </label>
              <input
                id="order-price"
                className="input"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
                placeholder="z. B. 29,90"
              />
            </div>

            {orderItem && (
              <div className="form-field">
                <label className="form-label" htmlFor="order-status">
                  Bestellstatus
                </label>
                <select
                  id="order-status"
                  className="select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OrderStatus)}
                >
                  <option value="open">Offen</option>
                  <option value="ordered">Bestellt</option>
                  <option value="received">Geliefert</option>
                </select>
              </div>
            )}

            <div className="form-field full">
              <label className="form-label" htmlFor="order-url">
                Shop-Link (optional)
              </label>
              <input
                id="order-url"
                type="url"
                className="input"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="form-field full">
              <label className="form-label" htmlFor="order-notes">
                Notizen
              </label>
              <textarea
                id="order-notes"
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
