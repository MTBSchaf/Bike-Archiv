import {
  Bike as BikeIcon,
  Download,
  Moon,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sun,
  Wrench,
} from 'lucide-react';
import type { TabKey, ThemeMode } from '../types';

interface HeaderProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  counts: {
    bikes: number;
    parts: number;
    openOrders: number;
  };
  theme: ThemeMode;
  onToggleTheme: () => void;
  catalogUpdatePending: boolean;
  onOpenUpdates: () => void;
  onPrimaryAction: () => void;
  onOpenBackup: () => void;
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
  theme,
  onToggleTheme,
  catalogUpdatePending,
  onOpenUpdates,
  onPrimaryAction,
  onOpenBackup,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          type="button"
          className="brand-group"
          onClick={() => onSelectTab('bikes')}
          aria-label="Zur Bike-Übersicht"
        >
          <span className="brand-logo-wrap">
            <img
              src="/images/logo-mtbschaf.png"
              alt="MTBSchaf Logo"
              className="brand-logo-img"
            />
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

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm theme-toggle-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Zum White Mode wechseln' : 'Zum Dark Mode wechseln'}
            aria-label={theme === 'dark' ? 'Zum White Mode wechseln' : 'Zum Dark Mode wechseln'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span className="hide-mobile">{theme === 'dark' ? 'White' : 'Dark'}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenUpdates}
            title="Updates & Systemstatus"
          >
            <RefreshCw size={14} />
            <span className="hide-mobile">Updates</span>
            {catalogUpdatePending && <span className="update-dot" aria-label="Update verfügbar" />}
          </button>

          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenBackup}>
            <Download size={14} />
            <span className="hide-mobile">Backup</span>
          </button>

          <button type="button" className="btn btn-primary btn-sm" onClick={onPrimaryAction}>
            <Plus size={15} />
            <span>{PRIMARY_LABELS[activeTab]}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
