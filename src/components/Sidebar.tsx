import { useEffect, useState } from 'react';
import {
  Bike as BikeIcon,
  Download,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import type { TabKey, ThemeMode } from '../types';

interface SidebarProps {
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

export function Sidebar({
  activeTab,
  onSelectTab,
  counts,
  theme,
  onToggleTheme,
  catalogUpdatePending,
  onOpenUpdates,
  onPrimaryAction,
  onOpenBackup,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  function handleNavSelect(tab: TabKey) {
    onSelectTab(tab);
    setMobileOpen(false);
  }

  function handleAction(action: () => void) {
    setMobileOpen(false);
    action();
  }

  const themeLabel = theme === 'dark' ? 'White Mode' : 'Dark Mode';
  const themeTitle =
    theme === 'dark' ? 'Zum White Mode wechseln' : 'Zum Dark Mode wechseln';

  return (
    <>
      <header className="mobile-header">
        <div className="mobile-header-left">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Navigation öffnen"
            aria-expanded={mobileOpen}
          >
            <Menu size={20} />
          </button>

          <button
            type="button"
            className="brand-group"
            onClick={() => handleNavSelect('bikes')}
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
        </div>

        <div className="mobile-header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            title={themeTitle}
            aria-label={themeTitle}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onPrimaryAction}
            aria-label={PRIMARY_LABELS[activeTab]}
          >
            <Plus size={15} />
            <span className="mobile-cta-label">{PRIMARY_LABELS[activeTab]}</span>
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`app-sidebar ${mobileOpen ? 'open' : ''}`}
        aria-label="Seitenleiste"
      >
        <div className="sidebar-header">
          <button
            type="button"
            className="brand-group"
            onClick={() => handleNavSelect('bikes')}
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

          <button
            type="button"
            className="icon-btn sidebar-close-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Navigation schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-primary-action">
          <button
            type="button"
            className="btn btn-primary sidebar-cta"
            onClick={() => handleAction(onPrimaryAction)}
          >
            <Plus size={15} />
            <span>{PRIMARY_LABELS[activeTab]}</span>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'bikes' ? 'active' : ''}`}
            onClick={() => handleNavSelect('bikes')}
            aria-current={activeTab === 'bikes' ? 'page' : undefined}
          >
            <BikeIcon size={17} />
            <span className="sidebar-nav-label">Bikes</span>
            <span className="nav-count">{counts.bikes}</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'parts' ? 'active' : ''}`}
            onClick={() => handleNavSelect('parts')}
            aria-current={activeTab === 'parts' ? 'page' : undefined}
          >
            <Wrench size={17} />
            <span className="sidebar-nav-label">Teile</span>
            <span className="nav-count">{counts.parts}</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => handleNavSelect('orders')}
            aria-current={activeTab === 'orders' ? 'page' : undefined}
          >
            <ShoppingCart size={17} />
            <span className="sidebar-nav-label">Bestellliste</span>
            <span className="nav-count">{counts.openOrders}</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-util-btn"
            onClick={onToggleTheme}
            title={themeTitle}
            aria-label={themeTitle}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{themeLabel}</span>
          </button>

          <button
            type="button"
            className="sidebar-util-btn"
            onClick={() => handleAction(onOpenUpdates)}
            title="Updates & Systemstatus"
          >
            <RefreshCw size={16} />
            <span>Updates</span>
            {catalogUpdatePending && (
              <span className="update-dot" aria-label="Update verfügbar" />
            )}
          </button>

          <button
            type="button"
            className="sidebar-util-btn"
            onClick={() => handleAction(onOpenBackup)}
          >
            <Download size={16} />
            <span>Backup</span>
          </button>
        </div>
      </aside>
    </>
  );
}
