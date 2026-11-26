import { useMemo, useState } from 'react';
import {
  Bike as BikeIcon,
  Copy,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  PART_CATEGORIES,
  type Bike,
  type Part,
  type PartStatus,
} from '../types';

interface PartsViewProps {
  parts: Part[];
  bikes: Bike[];
  onAddPart: () => void;
  onEditPart: (part: Part) => void;
  onDeletePart: (part: Part) => void;
  onSelectBike: (bikeId: string) => void;
  onOrderPart: (part: Part) => void;
  onCopySerial: (serial: string) => void;
}

const STATUS_LABELS: Record<PartStatus, string> = {
  in_use: 'In Verwendung',
  in_stock: 'Im Lager',
  defective: 'Defekt',
};

const STATUS_BADGE_CLASS: Record<PartStatus, string> = {
  in_use: 'badge badge-in-use',
  in_stock: 'badge badge-in-stock',
  defective: 'badge badge-defective',
};

export function PartsView({
  parts,
  bikes,
  onAddPart,
  onEditPart,
  onDeletePart,
  onSelectBike,
  onOrderPart,
  onCopySerial,
}: PartsViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | PartStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [bikeFilter, setBikeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    let inUse = 0;
    let inStock = 0;
    let defective = 0;
    for (const part of parts) {
      if (part.status === 'in_use') inUse += 1;
      else if (part.status === 'in_stock') inStock += 1;
      else defective += 1;
    }
    return {
      all: parts.length,
      in_use: inUse,
      in_stock: inStock,
      defective,
    };
  }, [parts]);

  const filteredParts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parts.filter((part) => {
      if (statusFilter !== 'all' && part.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && part.category !== categoryFilter) return false;
      if (bikeFilter !== 'all' && part.bikeId !== bikeFilter) return false;
      if (!q) return true;
      return (
        part.name.toLowerCase().includes(q) ||
        part.brand.toLowerCase().includes(q) ||
        part.category.toLowerCase().includes(q) ||
        part.specs.toLowerCase().includes(q) ||
        part.serialNumber.toLowerCase().includes(q) ||
        (part.bikeName && part.bikeName.toLowerCase().includes(q))
      );
    });
  }, [parts, statusFilter, categoryFilter, bikeFilter, query]);

  return (
    <section>
      <div className="page-header">
        <h1 className="page-title">Teile</h1>
      </div>

      <div className="card toolbar">
        <div className="filter-chips">
          {(
            [
              ['all', 'Alle'],
              ['in_use', 'In Verwendung'],
              ['in_stock', 'Im Lager'],
              ['defective', 'Defekt'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-chip ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              <span>{label}</span>
              <span className="filter-chip-count">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="toolbar-controls">
          <div className="search-field">
            <Search size={15} />
            <input
              type="search"
              className="search-input"
              placeholder="Teil, SN oder Bike suchen..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <select
            className="select-input"
            aria-label="Nach Kategorie filtern"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Alle Kategorien</option>
            {PART_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            className="select-input"
            aria-label="Nach Bike filtern"
            value={bikeFilter}
            onChange={(e) => setBikeFilter(e.target.value)}
          >
            <option value="all">Alle Bikes</option>
            {bikes.map((bike) => (
              <option key={bike.id} value={bike.id}>
                {bike.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredParts.length === 0 ? (
        <div className="card empty-state">
          <Wrench size={26} />
          <p>Keine passenden Teile gefunden.</p>
          {parts.length === 0 && (
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={onAddPart}>
                <Plus size={16} />
                <span>Teil anlegen</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card table-card desktop-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Teil</th>
                  <th>Kategorie</th>
                  <th>Seriennummer</th>
                  <th>Status</th>
                  <th>Verbaut in</th>
                  <th style={{ textAlign: 'right' }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((part) => (
                  <tr key={part.id}>
                    <td>
                      <div className="item-title">
                        {part.name}
                        {part.brand && (
                          <span
                            style={{
                              fontWeight: 450,
                              color: 'var(--text-secondary)',
                              marginLeft: 8,
                              fontSize: 12.5,
                            }}
                          >
                            {part.brand}
                          </span>
                        )}
                      </div>
                      {part.specs && <div className="item-sub">{part.specs}</div>}
                    </td>
                    <td>{part.category}</td>
                    <td>
                      {part.serialNumber ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span className="serial-value">{part.serialNumber}</span>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Seriennummer kopieren"
                            aria-label="Seriennummer kopieren"
                            onClick={() => onCopySerial(part.serialNumber)}
                          >
                            <Copy size={13} />
                          </button>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>–</span>
                      )}
                    </td>
                    <td>
                      <span className={STATUS_BADGE_CLASS[part.status]}>
                        {STATUS_LABELS[part.status]}
                      </span>
                    </td>
                    <td>
                      {part.status === 'in_use' && part.bikeId && part.bikeName ? (
                        <button
                          type="button"
                          className="bike-link-pill"
                          onClick={() => onSelectBike(part.bikeId!)}
                        >
                          <BikeIcon size={13} />
                          <span>{part.bikeName}</span>
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>–</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
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
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Teil löschen"
                          aria-label="Teil löschen"
                          onClick={() => onDeletePart(part)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {filteredParts.map((part) => (
              <div key={part.id} className="card" style={{ padding: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div className="item-title">{part.name}</div>
                    <div className="item-sub">
                      {part.brand ? `${part.brand} · ` : ''}
                      {part.category}
                    </div>
                  </div>
                  <span className={STATUS_BADGE_CLASS[part.status]}>
                    {STATUS_LABELS[part.status]}
                  </span>
                </div>

                {part.specs && <div className="item-sub">{part.specs}</div>}
                {part.serialNumber && (
                  <div className="item-sub mono" style={{ marginTop: 6 }}>
                    SN: {part.serialNumber}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-hairline)',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    {part.status === 'in_use' && part.bikeId && part.bikeName && (
                      <button
                        type="button"
                        className="bike-link-pill"
                        onClick={() => onSelectBike(part.bikeId!)}
                      >
                        <BikeIcon size={13} />
                        <span>{part.bikeName}</span>
                      </button>
                    )}
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onOrderPart(part)}
                      aria-label="Auf Bestellliste setzen"
                    >
                      <ShoppingCart size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onEditPart(part)}
                      aria-label="Teil bearbeiten"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => onDeletePart(part)}
                      aria-label="Teil löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
