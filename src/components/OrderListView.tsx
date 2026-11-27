import { useMemo, useState } from 'react';
import {
  Bike as BikeIcon,
  ExternalLink,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import type { OrderItem, OrderPriority, OrderStatus, Part, PartCategory } from '../types';

interface OrderListViewProps {
  orderItems: OrderItem[];
  parts: Part[];
  onAddOrder: () => void;
  onEditOrder: (item: OrderItem) => void;
  onDeleteOrder: (item: OrderItem) => void;
  onChangeOrderStatus: (item: OrderItem, status: OrderStatus) => Promise<void>;
  onReceiveToStock: (item: OrderItem) => Promise<void>;
  onSelectBike: (bikeId: string) => void;
}

const PRIORITY_LABELS: Record<OrderPriority, string> = {
  high: 'Hoch',
  normal: 'Normal',
  low: 'Niedrig',
};

const PRIORITY_CLASSES: Record<OrderPriority, string> = {
  high: 'badge badge-priority-high',
  normal: 'badge badge-priority-normal',
  low: 'badge badge-priority-low',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  open: 'Offen',
  ordered: 'Bestellt',
  received: 'Geliefert',
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  open: 'badge badge-order-open',
  ordered: 'badge badge-order-ordered',
  received: 'badge badge-order-received',
};

const CATEGORY_DEFAULT_IMAGES: Record<PartCategory, string> = {
  Rahmen: '/images/parts/frame-m5-alloy.svg',
  Fahrwerk: '/images/parts/fork-fox-36-rhythm.svg',
  Antrieb: '/images/parts/drivetrain-derailleur.svg',
  Bremsen: '/images/parts/brake-code-r.svg',
  'Laufräder & Reifen': '/images/parts/wheel-alloy-mtb.svg',
  'Cockpit & Sattel': '/images/parts/cockpit-bar-stem.svg',
  'Lager & Achsen': '/images/parts/hardware-bearings-bolts.svg',
  'Schrauben & Kleinteile': '/images/parts/seatclamp-smallparts.svg',
  Sonstiges: '/images/parts/seatclamp-smallparts.svg',
};

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '–';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function OrderListView({
  orderItems,
  parts,
  onAddOrder,
  onEditOrder,
  onDeleteOrder,
  onChangeOrderStatus,
  onReceiveToStock,
  onSelectBike,
}: OrderListViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [query, setQuery] = useState('');

  const partImageById = useMemo(() => {
    const map = new Map<string, string>();
    for (const part of parts) {
      if (part.imageUrl) {
        map.set(part.id, part.imageUrl);
      }
    }
    return map;
  }, [parts]);

  function resolveOrderImage(item: OrderItem): string {
    if (item.imageUrl) return item.imageUrl;
    if (item.partId && partImageById.has(item.partId)) {
      return partImageById.get(item.partId)!;
    }
    return CATEGORY_DEFAULT_IMAGES[item.category] || '/images/parts/seatclamp-smallparts.svg';
  }

  const counts = useMemo(() => {
    let open = 0;
    let ordered = 0;
    let received = 0;
    let openSum = 0;
    for (const item of orderItems) {
      if (item.status === 'open') {
        open += 1;
        if (item.estimatedPrice !== null) {
          openSum += item.estimatedPrice * item.quantity;
        }
      } else if (item.status === 'ordered') {
        ordered += 1;
      } else {
        received += 1;
      }
    }
    return {
      all: orderItems.length,
      open,
      ordered,
      received,
      openSum,
    };
  }, [orderItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orderItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.bikeName && item.bikeName.toLowerCase().includes(q)) ||
        item.notes.toLowerCase().includes(q)
      );
    });
  }, [orderItems, statusFilter, query]);

  return (
    <section>
      <div className="page-header">
        <h1 className="page-title">Bestellliste</h1>
        {counts.openSum > 0 && (
          <div className="summary-strip">
            <span>
              Offener Bedarf: <strong>{formatCurrency(counts.openSum)}</strong>
            </span>
          </div>
        )}
      </div>

      <div className="card toolbar">
        <div className="filter-chips">
          {(
            [
              ['all', 'Alle'],
              ['open', 'Offen'],
              ['ordered', 'Bestellt'],
              ['received', 'Geliefert'],
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
              placeholder="Bestellposten suchen..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="card empty-state">
          <ShoppingCart size={26} />
          <p>
            {orderItems.length === 0
              ? 'Die Bestellliste ist aktuell leer.'
              : 'Keine passenden Bestellposten gefunden.'}
          </p>
          {orderItems.length === 0 && (
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={onAddOrder}>
                <Plus size={16} />
                <span>Posten hinzufügen</span>
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
                  <th>Menge</th>
                  <th>Priorität</th>
                  <th>Für Bike</th>
                  <th>Preis</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="table-item-with-thumb">
                        <div className="part-thumb">
                          <img src={resolveOrderImage(item)} alt={item.name} loading="lazy" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="item-title">
                            <span>{item.name}</span>
                            {item.brand && (
                              <span
                                style={{
                                  fontWeight: 450,
                                  color: 'var(--text-secondary)',
                                  fontSize: 12.5,
                                }}
                              >
                                {item.brand}
                              </span>
                            )}
                          </div>
                          <div className="item-sub">
                            {item.category}
                            {item.notes ? ` · ${item.notes}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{item.quantity}×</td>
                    <td>
                      <span className={PRIORITY_CLASSES[item.priority]}>
                        {PRIORITY_LABELS[item.priority]}
                      </span>
                    </td>
                    <td>
                      {item.bikeId && item.bikeName ? (
                        <button
                          type="button"
                          className="bike-link-pill"
                          onClick={() => onSelectBike(item.bikeId!)}
                        >
                          <BikeIcon size={13} />
                          <span>{item.bikeName}</span>
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>–</span>
                      )}
                    </td>
                    <td>
                      {item.estimatedPrice !== null
                        ? formatCurrency(item.estimatedPrice * item.quantity)
                        : '–'}
                    </td>
                    <td>
                      <select
                        className="select-input"
                        style={{ padding: '5px 10px', fontSize: 12.5 }}
                        aria-label={`Status für ${item.name}`}
                        value={item.status}
                        onChange={(e) =>
                          onChangeOrderStatus(item, e.target.value as OrderStatus)
                        }
                      >
                        <option value="open">Offen</option>
                        <option value="ordered">Bestellt</option>
                        <option value="received">Geliefert</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
                        {item.status !== 'received' && (
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            title="Ins Lager übernehmen"
                            onClick={() => onReceiveToStock(item)}
                          >
                            <PackageCheck size={14} />
                            <span>Ins Lager</span>
                          </button>
                        )}
                        {item.shopUrl && (
                          <a
                            href={item.shopUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="icon-btn"
                            title="Shop-Link öffnen"
                            aria-label="Shop-Link öffnen"
                          >
                            <ExternalLink size={15} />
                          </a>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          title="Posten bearbeiten"
                          aria-label="Posten bearbeiten"
                          onClick={() => onEditOrder(item)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Posten löschen"
                          aria-label="Posten löschen"
                          onClick={() => onDeleteOrder(item)}
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
            {filteredItems.map((item) => (
              <div key={item.id} className="card" style={{ padding: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <div className="table-item-with-thumb">
                    <div className="part-thumb">
                      <img src={resolveOrderImage(item)} alt={item.name} loading="lazy" />
                    </div>
                    <div>
                      <div className="item-title">
                        {item.quantity}× {item.name}
                      </div>
                      <div className="item-sub">
                        {item.brand ? `${item.brand} · ` : ''}
                        {item.category}
                      </div>
                    </div>
                  </div>
                  <span className={STATUS_CLASSES[item.status]}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginTop: 10,
                    alignItems: 'center',
                  }}
                >
                  <span className={PRIORITY_CLASSES[item.priority]}>
                    {PRIORITY_LABELS[item.priority]}
                  </span>
                  {item.estimatedPrice !== null && (
                    <span className="meta-chip">
                      {formatCurrency(item.estimatedPrice * item.quantity)}
                    </span>
                  )}
                  {item.bikeId && item.bikeName && (
                    <button
                      type="button"
                      className="bike-link-pill"
                      onClick={() => onSelectBike(item.bikeId!)}
                    >
                      <BikeIcon size={13} />
                      <span>{item.bikeName}</span>
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-hairline)',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {item.status !== 'received' ? (
                    <button
                      type="button"
                      className="btn btn-subtle btn-sm"
                      onClick={() => onReceiveToStock(item)}
                    >
                      <PackageCheck size={14} />
                      <span>Ins Lager übernehmen</span>
                    </button>
                  ) : (
                    <span className="item-sub">Im Lager eingebucht</span>
                  )}
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onEditOrder(item)}
                      aria-label="Posten bearbeiten"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => onDeleteOrder(item)}
                      aria-label="Posten löschen"
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
