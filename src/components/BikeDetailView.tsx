import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Bike as BikeIcon,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Wrench,
} from 'lucide-react';
import { PART_CATEGORIES, type Bike, type Part } from '../types';

interface BikeDetailViewProps {
  bike: Bike;
  parts: Part[];
  onBack: () => void;
  onEditBike: (bike: Bike) => void;
  onDeleteBike: (bike: Bike) => void;
  onAddSerial: (
    bikeId: string,
    input: { label: string; serialNumber: string; notes: string },
  ) => Promise<void>;
  onDeleteSerial: (bikeId: string, serialId: string) => Promise<void>;
  onOpenAssignPart: () => void;
  onEditPart: (part: Part) => void;
  onMovePartStatus: (part: Part, status: 'in_stock' | 'defective') => Promise<void>;
  onOrderPart: (part: Part) => void;
  onCopySerial: (serial: string) => void;
}

export function BikeDetailView({
  bike,
  parts,
  onBack,
  onEditBike,
  onDeleteBike,
  onAddSerial,
  onDeleteSerial,
  onOpenAssignPart,
  onEditPart,
  onMovePartStatus,
  onOrderPart,
  onCopySerial,
}: BikeDetailViewProps) {
  const [partQuery, setPartQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedPartIds, setExpandedPartIds] = useState<Record<string, boolean>>({});
  const [serialLabel, setSerialLabel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [serialNotes, setSerialNotes] = useState('');
  const [serialBusy, setSerialBusy] = useState(false);
  const [serialError, setSerialError] = useState('');

  const installedParts = useMemo(
    () => parts.filter((part) => part.status === 'in_use' && part.bikeId === bike.id),
    [parts, bike.id],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const part of installedParts) {
      counts.set(part.category, (counts.get(part.category) ?? 0) + 1);
    }
    return counts;
  }, [installedParts]);

  const bikeParts = useMemo(() => {
    const q = partQuery.trim().toLowerCase();
    return installedParts.filter((part) => {
      if (categoryFilter !== 'all' && part.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        part.name.toLowerCase().includes(q) ||
        part.brand.toLowerCase().includes(q) ||
        part.category.toLowerCase().includes(q) ||
        part.subCategory.toLowerCase().includes(q) ||
        part.partNumber.toLowerCase().includes(q) ||
        part.specs.toLowerCase().includes(q) ||
        part.serialNumber.toLowerCase().includes(q) ||
        part.structuredSpecs.some(
          (s) =>
            s.label.toLowerCase().includes(q) || s.value.toLowerCase().includes(q),
        )
      );
    });
  }, [installedParts, categoryFilter, partQuery]);

  const groupedParts = useMemo(() => {
    const map = new Map<string, Part[]>();
    for (const cat of PART_CATEGORIES) {
      map.set(cat, []);
    }
    for (const part of bikeParts) {
      const list = map.get(part.category) ?? [];
      list.push(part);
      map.set(part.category, list);
    }
    return PART_CATEGORIES.map((cat) => ({
      category: cat,
      items: map.get(cat) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [bikeParts]);

  function toggleExpanded(partId: string) {
    setExpandedPartIds((prev) => ({
      ...prev,
      [partId]: !prev[partId],
    }));
  }

  async function handleSerialSubmit(e: FormEvent) {
    e.preventDefault();
    setSerialError('');
    if (!serialLabel.trim() || !serialNumber.trim()) {
      setSerialError('Bitte Bezeichnung und konkrete Seriennummer angeben.');
      return;
    }
    setSerialBusy(true);
    try {
      await onAddSerial(bike.id, {
        label: serialLabel.trim(),
        serialNumber: serialNumber.trim(),
        notes: serialNotes.trim(),
      });
      setSerialLabel('');
      setSerialNumber('');
      setSerialNotes('');
    } catch (err) {
      setSerialError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSerialBusy(false);
    }
  }

  return (
    <section>
      <button type="button" className="detail-back" onClick={onBack}>
        <ArrowLeft size={15} />
        <span>Alle Bikes</span>
      </button>

      <div className="card detail-hero">
        <div className="detail-hero-layout">
          <div className="detail-hero-media">
            {bike.imageUrl ? (
              <img src={bike.imageUrl} alt={bike.name} />
            ) : (
              <div className="media-placeholder">
                <BikeIcon size={44} />
              </div>
            )}
          </div>

          <div>
            <div className="detail-hero-top">
              <div>
                <div className="bike-card-brand">{bike.brand}</div>
                <h1 className="page-title" style={{ marginTop: 2 }}>
                  {bike.name}
                </h1>
              </div>
              <div className="row-actions" style={{ gap: 8, flexWrap: 'wrap' }}>
                {bike.manufacturerUrl && (
                  <a
                    href={bike.manufacturerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    <ExternalLink size={14} />
                    <span>Herstellerseite</span>
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onEditBike(bike)}
                >
                  <Pencil size={14} />
                  <span>Bearbeiten</span>
                </button>
                <button
                  type="button"
                  className="btn btn-danger-outline btn-sm"
                  onClick={() => onDeleteBike(bike)}
                >
                  <Trash2 size={14} />
                  <span>Löschen</span>
                </button>
              </div>
            </div>

            <div className="detail-meta-grid">
              <div className="detail-meta-item">
                <label>Modell</label>
                <span>{bike.model}</span>
              </div>
              <div className="detail-meta-item">
                <label>Jahrgang</label>
                <span>{bike.modelYear || '–'}</span>
              </div>
              <div className="detail-meta-item">
                <label>Kategorie</label>
                <span>{bike.category || '–'}</span>
              </div>
              <div className="detail-meta-item">
                <label>Rahmengröße</label>
                <span>{bike.frameSize || '–'}</span>
              </div>
              <div className="detail-meta-item">
                <label>Laufräder</label>
                <span>{bike.wheelSize || '–'}</span>
              </div>
              <div className="detail-meta-item">
                <label>Farbe</label>
                <span>{bike.color || '–'}</span>
              </div>
            </div>

            {bike.notes && (
              <p style={{ margin: '14px 0 0', color: 'var(--text-secondary)', fontSize: 13.5 }}>
                {bike.notes}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card section-card">
        <div className="section-header">
          <h2 className="section-title">Seriennummern</h2>
        </div>

        <div className="serials-list">
          <div className="serial-entry">
            <div style={{ minWidth: 0 }}>
              <span className="serial-label">Haupt-Rahmennummer</span>
              {bike.serialNumber ? (
                <span className="serial-value">{bike.serialNumber}</span>
              ) : (
                <span className="serial-empty">Nicht hinterlegt</span>
              )}
            </div>
            <div className="row-actions">
              {bike.serialNumber ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="Kopieren"
                  aria-label="Haupt-Rahmennummer kopieren"
                  onClick={() => onCopySerial(bike.serialNumber)}
                >
                  <Copy size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={() => onEditBike(bike)}
                >
                  Eintragen
                </button>
              )}
            </div>
          </div>

          {bike.serials.map((entry) => (
            <div key={entry.id} className="serial-entry">
              <div style={{ minWidth: 0 }}>
                <span className="serial-label">{entry.label}</span>
                <span className="serial-value">{entry.serialNumber}</span>
                {entry.notes && (
                  <div className="item-sub" style={{ fontSize: 11.5 }}>
                    {entry.notes}
                  </div>
                )}
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="icon-btn"
                  title="Seriennummer kopieren"
                  aria-label={`${entry.label} kopieren`}
                  onClick={() => onCopySerial(entry.serialNumber)}
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  title="Seriennummer entfernen"
                  aria-label={`${entry.label} entfernen`}
                  onClick={() => onDeleteSerial(bike.id, entry.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <form className="inline-serial-form" onSubmit={handleSerialSubmit}>
          <input
            type="text"
            className="input"
            placeholder="Bezeichnung (z. B. Gabel-Seriennummer)"
            value={serialLabel}
            onChange={(e) => setSerialLabel(e.target.value)}
            maxLength={120}
          />
          <input
            type="text"
            className="input mono"
            placeholder="Konkrete Seriennummer"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            maxLength={160}
          />
          <input
            type="text"
            className="input"
            placeholder="Notiz (optional)"
            value={serialNotes}
            onChange={(e) => setSerialNotes(e.target.value)}
            maxLength={500}
          />
          <button type="submit" className="btn btn-secondary" disabled={serialBusy}>
            <Plus size={15} />
            <span>Hinzufügen</span>
          </button>
        </form>
        {serialError && <div className="form-error">{serialError}</div>}
      </div>

      <div className="card section-card">
        <div className="section-header">
          <h2 className="section-title">
            Verbaute Teile ({installedParts.length})
          </h2>

          <div className="toolbar-controls">
            <div className="search-field">
              <Search size={15} />
              <input
                type="search"
                className="search-input"
                placeholder="Teil, Teilenummer oder Wert suchen..."
                value={partQuery}
                onChange={(e) => setPartQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onOpenAssignPart}
            >
              <Plus size={15} />
              <span>Teil zuordnen</span>
            </button>
          </div>
        </div>

        {installedParts.length > 0 && (
          <div className="filter-chips" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className={`filter-chip ${categoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              <span>Alle</span>
              <span className="filter-chip-count">{installedParts.length}</span>
            </button>
            {PART_CATEGORIES.filter((cat) => (categoryCounts.get(cat) ?? 0) > 0).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`filter-chip ${categoryFilter === cat ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  <span>{cat}</span>
                  <span className="filter-chip-count">{categoryCounts.get(cat)}</span>
                </button>
              ),
            )}
          </div>
        )}

        {groupedParts.length === 0 ? (
          <div className="empty-state">
            <Wrench size={24} />
            <p>
              {installedParts.length === 0
                ? 'Diesem Bike sind noch keine Teile zugeordnet.'
                : 'Keine passenden Teile gefunden.'}
            </p>
          </div>
        ) : (
          groupedParts.map((group) => (
            <div key={group.category} className="parts-group">
              <h3 className="parts-group-title">
                {group.category} ({group.items.length})
              </h3>
              <div className="parts-group-list">
                {group.items.map((part) => {
                  const isExpanded = Boolean(expandedPartIds[part.id]);
                  const hasDetails =
                    part.structuredSpecs.length > 0 ||
                    Boolean(part.manufacturerUrl) ||
                    Boolean(part.notes);

                  return (
                    <div key={part.id} className="part-row-wrap">
                      <div className="part-row">
                        <div className="part-row-main">
                          <div className="part-thumb">
                            {part.imageUrl ? (
                              <img src={part.imageUrl} alt={part.name} loading="lazy" />
                            ) : (
                              <Wrench size={16} />
                            )}
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="item-title">
                              <span>{part.name}</span>
                              {part.brand && (
                                <span
                                  style={{
                                    fontWeight: 450,
                                    color: 'var(--text-secondary)',
                                    fontSize: 12.5,
                                  }}
                                >
                                  {part.brand}
                                </span>
                              )}
                              {part.quantity > 1 && (
                                <span className="qty-pill">{part.quantity}×</span>
                              )}
                              {part.partNumber && (
                                <span className="part-number-tag">{part.partNumber}</span>
                              )}
                            </div>

                            {part.specs && <div className="item-sub">{part.specs}</div>}
                            {part.serialNumber && (
                              <div className="item-sub mono">SN: {part.serialNumber}</div>
                            )}

                            {part.structuredSpecs.length > 0 && !isExpanded && (
                              <div className="spec-chip-row">
                                {part.structuredSpecs.slice(0, 3).map((spec, idx) => (
                                  <span key={idx} className="spec-chip">
                                    <span>{spec.label}:</span>
                                    <strong>{spec.value}</strong>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="row-actions" style={{ flexWrap: 'wrap' }}>
                          {hasDetails && (
                            <button
                              type="button"
                              className="btn btn-subtle btn-sm"
                              onClick={() => toggleExpanded(part.id)}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              <span>Details</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            onClick={() => onMovePartStatus(part, 'in_stock')}
                          >
                            Ins Lager
                          </button>
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            onClick={() => onMovePartStatus(part, 'defective')}
                          >
                            Defekt
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Auf Bestellliste setzen"
                            aria-label="Auf Bestellliste setzen"
                            onClick={() => onOrderPart(part)}
                          >
                            <ShoppingCart size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Teil bearbeiten"
                            aria-label="Teil bearbeiten"
                            onClick={() => onEditPart(part)}
                          >
                            <Pencil size={15} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && hasDetails && (
                        <div className="part-expanded-panel">
                          <div className="part-thumb lg">
                            {part.imageUrl ? (
                              <img src={part.imageUrl} alt={part.name} />
                            ) : (
                              <Wrench size={24} />
                            )}
                          </div>

                          <div>
                            {part.structuredSpecs.length > 0 && (
                              <div className="structured-specs-grid">
                                {part.structuredSpecs.map((spec, idx) => (
                                  <div key={idx} className="structured-spec-cell">
                                    <span className="structured-spec-label">{spec.label}</span>
                                    <span className="structured-spec-value">{spec.value}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {part.notes && (
                              <div className="item-sub" style={{ marginTop: 10 }}>
                                Notiz: {part.notes}
                              </div>
                            )}

                            {part.manufacturerUrl && (
                              <div style={{ marginTop: 10 }}>
                                <a
                                  href={part.manufacturerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary btn-sm"
                                >
                                  <ExternalLink size={13} />
                                  <span>Herstellerseite</span>
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
