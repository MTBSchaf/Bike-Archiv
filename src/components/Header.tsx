import { Bike as BikeIcon, Plus, ShoppingCart, Wrench } from 'lucide-react';
import type { TabKey } from '../types';

interface HeaderProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  counts: {
    bikes: number;
    parts: number;
    openOrders: number;
  };
  onPrimaryAction: () => void;
}

const PRIMARY_LABELS: Record<TabKey, string> = {
  bikes: 'Bike anlegen',
  parts: 'Teil anlegen',
  orders: 'Posten hinzufügen',
};

export function Header({
  activeTab,
  onSelectTab,
  counts,
  onPrimaryAction,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          type="button"
          className="brand-group"
          onClick={() => onSelectTab('bikes')}
        >
          <span className="brand-mark" aria-hidden="true">
            <BikeIcon size={18} strokeWidth={2.2} />
          </span>
          <span className="brand-title">Bike Archiv</span>
        </button>

        <nav className="nav-pills" aria-label="Hauptnavigation">
          <button
            type="button"
            className={`nav-pill ${activeTab === 'bikes' ? 'active' : ''}`}
            onClick={() => onSelectTab('bikes')}
          >
            <BikeIcon size={15} />
            <span>Bikes</span>
            <span className="nav-count">{counts.bikes}</span>
          </button>

          <button
            type="button"
            className={`nav-pill ${activeTab === 'parts' ? 'active' : ''}`}
            onClick={() => onSelectTab('parts')}
          >
            <Wrench size={15} />
            <span>Teile</span>
            <span className="nav-count">{counts.parts}</span>
          </button>

          <button
            type="button"
            className={`nav-pill ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => onSelectTab('orders')}
          >
            <ShoppingCart size={15} />
            <span>Bestellliste</span>
            <span className="nav-count">{counts.openOrders}</span>
          </button>
        </nav>

        <button type="button" className="btn btn-primary" onClick={onPrimaryAction}>
          <Plus size={16} />
          <span>{PRIMARY_LABELS[activeTab]}</span>
        </button>
      </div>
    </header>
  );
}
