import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { AssignPartModal } from './components/AssignPartModal';
import { BackupModal } from './components/BackupModal';
import { BikeDetailView } from './components/BikeDetailView';
import { BikeModal } from './components/BikeModal';
import { BikesView } from './components/BikesView';
import { ConfirmModal } from './components/ConfirmModal';
import { Header } from './components/Header';
import { OrderListView } from './components/OrderListView';
import { OrderModal } from './components/OrderModal';
import { PartModal } from './components/PartModal';
import { PartsView } from './components/PartsView';
import { Toast } from './components/Toast';
import { UpdateModal } from './components/UpdateModal';
import { applyTheme, getInitialTheme } from './theme';
import type {
  ApplyUpdateResponse,
  Bike,
  BikeFormInput,
  OrderFormInput,
  OrderItem,
  OrderStatus,
  Part,
  PartFormInput,
  SystemStatus,
  TabKey,
  ThemeMode,
} from './types';

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [activeTab, setActiveTab] = useState<TabKey>('bikes');
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  const [bikeModalState, setBikeModalState] = useState<{
    open: boolean;
    bike: Bike | null;
  }>({ open: false, bike: null });

  const [partModalState, setPartModalState] = useState<{
    open: boolean;
    part: Part | null;
    defaultBikeId?: string | null;
  }>({ open: false, part: null, defaultBikeId: null });

  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const [orderModalState, setOrderModalState] = useState<{
    open: boolean;
    orderItem: OrderItem | null;
    prefill?: Partial<OrderFormInput> | null;
  }>({ open: false, orderItem: null, prefill: null });

  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'bike'; item: Bike }
    | { type: 'part'; item: Part }
    | { type: 'order'; item: OrderItem }
    | null
  >(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    tone: 'default' | 'error';
  } | null>(null);

  const showToast = useCallback(
    (message: string, tone: 'default' | 'error' = 'default') => {
      setToast({ message, tone });
    },
    [],
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadAll = useCallback(async () => {
    try {
      const [data, status] = await Promise.all([
        api.getBootstrap(),
        api.getSystemStatus().catch(() => null),
      ]);
      setBikes(data.bikes);
      setParts(data.parts);
      setOrderItems(data.orderItems);
      if (status) {
        setSystemStatus(status);
      }
      setLoadError('');
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Daten konnten nicht geladen werden.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const selectedBike = useMemo(
    () => bikes.find((b) => b.id === selectedBikeId) ?? null,
    [bikes, selectedBikeId],
  );

  const stockParts = useMemo(
    () => parts.filter((p) => p.status === 'in_stock'),
    [parts],
  );

  const openOrdersCount = useMemo(
    () => orderItems.filter((item) => item.status !== 'received').length,
    [orderItems],
  );

  function handleToggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function handleSelectTab(tab: TabKey) {
    setActiveTab(tab);
    if (tab !== 'bikes') {
      setSelectedBikeId(null);
    } else if (selectedBikeId && !bikes.some((b) => b.id === selectedBikeId)) {
      setSelectedBikeId(null);
    }
  }

  function handleSelectBike(bikeId: string) {
    setSelectedBikeId(bikeId);
    setActiveTab('bikes');
  }

  function handlePrimaryAction() {
    if (activeTab === 'bikes') {
      setBikeModalState({ open: true, bike: null });
    } else if (activeTab === 'parts') {
      setPartModalState({ open: true, part: null, defaultBikeId: null });
    } else {
      setOrderModalState({ open: true, orderItem: null, prefill: null });
    }
  }

  async function handleCopyText(text: string, label = 'Seriennummer kopiert') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label);
    } catch {
      showToast('Kopieren in Zwischenablage nicht möglich', 'error');
    }
  }

  async function handleSaveBike(input: BikeFormInput, bikeId?: string) {
    if (bikeId) {
      await api.updateBike(bikeId, input);
      showToast('Bike aktualisiert');
    } else {
      const { bike } = await api.createBike(input);
      setSelectedBikeId(bike.id);
      setActiveTab('bikes');
      showToast('Bike angelegt');
    }
    await loadAll();
  }

  async function handleAddSerial(
    bikeId: string,
    input: { label: string; serialNumber: string; notes: string },
  ) {
    await api.addBikeSerial(bikeId, input);
    await loadAll();
    showToast('Seriennummer hinzugefügt');
  }

  async function handleDeleteSerial(bikeId: string, serialId: string) {
    try {
      await api.deleteBikeSerial(bikeId, serialId);
      await loadAll();
      showToast('Seriennummer entfernt');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Löschen fehlgeschlagen.',
        'error',
      );
    }
  }

  async function handleSavePart(input: PartFormInput, partId?: string) {
    if (partId) {
      await api.updatePart(partId, input);
      showToast('Teil aktualisiert');
    } else {
      await api.createPart(input);
      showToast('Teil angelegt');
    }
    await loadAll();
  }

  async function handleAssignExistingPart(part: Part, bikeId: string) {
    await api.updatePart(part.id, {
      name: part.name,
      brand: part.brand,
      category: part.category,
      subCategory: part.subCategory,
      partNumber: part.partNumber,
      quantity: part.quantity,
      specs: part.specs,
      structuredSpecs: part.structuredSpecs,
      manufacturerUrl: part.manufacturerUrl,
      imageUrl: part.imageUrl,
      catalogKey: part.catalogKey,
      serialNumber: part.serialNumber,
      status: 'in_use',
      bikeId,
      notes: part.notes,
    });
    await loadAll();
    showToast('Teil dem Bike zugeordnet');
  }

  async function handleMovePartStatus(
    part: Part,
    status: 'in_stock' | 'defective',
  ) {
    try {
      await api.updatePart(part.id, {
        name: part.name,
        brand: part.brand,
        category: part.category,
        subCategory: part.subCategory,
        partNumber: part.partNumber,
        quantity: part.quantity,
        specs: part.specs,
        structuredSpecs: part.structuredSpecs,
        manufacturerUrl: part.manufacturerUrl,
        imageUrl: part.imageUrl,
        catalogKey: part.catalogKey,
        serialNumber: part.serialNumber,
        status,
        bikeId: null,
        notes: part.notes,
      });
      await loadAll();
      showToast(
        status === 'in_stock' ? 'Teil ins Lager gelegt' : 'Teil als defekt markiert',
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Statuswechsel fehlgeschlagen.',
        'error',
      );
    }
  }

  function handleOpenOrderForPart(part: Part) {
    setOrderModalState({
      open: true,
      orderItem: null,
      prefill: {
        name: part.name,
        brand: part.brand,
        category: part.category,
        bikeId: part.bikeId,
        partId: part.id,
        quantity: 1,
        priority: part.status === 'defective' ? 'high' : 'normal',
        imageUrl: part.imageUrl,
        notes: part.specs,
      },
    });
  }

  async function handleSaveOrder(input: OrderFormInput, orderId?: string) {
    if (orderId) {
      await api.updateOrderItem(orderId, input);
      showToast('Bestellposten aktualisiert');
    } else {
      await api.createOrderItem(input);
      showToast('Zur Bestellliste hinzugefügt');
    }
    await loadAll();
  }

  async function handleChangeOrderStatus(item: OrderItem, status: OrderStatus) {
    try {
      await api.updateOrderItem(item.id, {
        name: item.name,
        brand: item.brand,
        category: item.category,
        bikeId: item.bikeId,
        partId: item.partId,
        quantity: item.quantity,
        priority: item.priority,
        estimatedPrice: item.estimatedPrice,
        shopUrl: item.shopUrl,
        imageUrl: item.imageUrl,
        status,
        notes: item.notes,
      });
      await loadAll();
      showToast('Bestellstatus aktualisiert');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen.',
        'error',
      );
    }
  }

  async function handleReceiveToStock(item: OrderItem) {
    try {
      await api.receiveOrderItemToStock(item.id);
      await loadAll();
      showToast('Teil ins Lager übernommen');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Übernahme fehlgeschlagen.',
        'error',
      );
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    try {
      if (confirmDelete.type === 'bike') {
        await api.deleteBike(confirmDelete.item.id);
        if (selectedBikeId === confirmDelete.item.id) {
          setSelectedBikeId(null);
        }
        showToast('Bike gelöscht');
      } else if (confirmDelete.type === 'part') {
        await api.deletePart(confirmDelete.item.id);
        showToast('Teil gelöscht');
      } else {
        await api.deleteOrderItem(confirmDelete.item.id);
        showToast('Bestellposten gelöscht');
      }
      setConfirmDelete(null);
      await loadAll();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Löschen fehlgeschlagen.',
        'error',
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleImportBackup(payload: unknown) {
    const data = await api.importBackup(payload);
    setBikes(data.bikes);
    setParts(data.parts);
    setOrderItems(data.orderItems);
    if (selectedBikeId && !data.bikes.some((b) => b.id === selectedBikeId)) {
      setSelectedBikeId(null);
    }
    setBackupModalOpen(false);
    showToast('Backup importiert');
  }

  function applyUpdateState(res: ApplyUpdateResponse) {
    setBikes(res.bikes);
    setParts(res.parts);
    setOrderItems(res.orderItems);
    setSystemStatus(res.systemStatus);
    if (selectedBikeId && !res.bikes.some((b) => b.id === selectedBikeId)) {
      setSelectedBikeId(null);
    }
  }

  async function handleApplyCatalogUpdate() {
    const res = await api.applyCatalogUpdate(true);
    applyUpdateState(res);
    showToast('Katalog-Update eingespielt');
    return res;
  }

  async function handleApplyPackageUpdate(pkg: unknown) {
    const res = await api.applyUpdatePackage(pkg);
    applyUpdateState(res);
    showToast('Update-Paket eingespielt');
    return res;
  }

  return (
    <div className="app-shell">
      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        counts={{
          bikes: bikes.length,
          parts: parts.length,
          openOrders: openOrdersCount,
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        catalogUpdatePending={Boolean(systemStatus?.catalogUpdatePending)}
        onOpenUpdates={() => setUpdateModalOpen(true)}
        onPrimaryAction={handlePrimaryAction}
        onOpenBackup={() => setBackupModalOpen(true)}
      />

      <main className="main-content">
        {loading ? (
          <div className="card empty-state">
            <p>Bestand wird geladen...</p>
          </div>
        ) : loadError ? (
          <div className="card empty-state">
            <p>{loadError}</p>
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={() => void loadAll()}>
                Erneut laden
              </button>
            </div>
          </div>
        ) : activeTab === 'bikes' ? (
          selectedBike ? (
            <BikeDetailView
              bike={selectedBike}
              parts={parts}
              onBack={() => setSelectedBikeId(null)}
              onEditBike={(bike) => setBikeModalState({ open: true, bike })}
              onDeleteBike={(bike) => setConfirmDelete({ type: 'bike', item: bike })}
              onAddSerial={handleAddSerial}
              onDeleteSerial={handleDeleteSerial}
              onOpenAssignPart={() => setAssignModalOpen(true)}
              onEditPart={(part) =>
                setPartModalState({ open: true, part, defaultBikeId: selectedBike.id })
              }
              onMovePartStatus={handleMovePartStatus}
              onOrderPart={handleOpenOrderForPart}
              onCopySerial={(serial) => void handleCopyText(serial)}
            />
          ) : (
            <BikesView
              bikes={bikes}
              onSelectBike={handleSelectBike}
              onAddBike={() => setBikeModalState({ open: true, bike: null })}
              onCopySerial={(serial) => void handleCopyText(serial)}
            />
          )
        ) : activeTab === 'parts' ? (
          <PartsView
            parts={parts}
            bikes={bikes}
            onAddPart={() =>
              setPartModalState({ open: true, part: null, defaultBikeId: null })
            }
            onEditPart={(part) =>
              setPartModalState({ open: true, part, defaultBikeId: part.bikeId })
            }
            onDeletePart={(part) => setConfirmDelete({ type: 'part', item: part })}
            onSelectBike={handleSelectBike}
            onOrderPart={handleOpenOrderForPart}
            onCopySerial={(serial) => void handleCopyText(serial)}
          />
        ) : (
          <OrderListView
            orderItems={orderItems}
            parts={parts}
            onAddOrder={() =>
              setOrderModalState({ open: true, orderItem: null, prefill: null })
            }
            onEditOrder={(item) =>
              setOrderModalState({ open: true, orderItem: item, prefill: null })
            }
            onDeleteOrder={(item) => setConfirmDelete({ type: 'order', item })}
            onChangeOrderStatus={handleChangeOrderStatus}
            onReceiveToStock={handleReceiveToStock}
            onSelectBike={handleSelectBike}
          />
        )}
      </main>

      {bikeModalState.open && (
        <BikeModal
          bike={bikeModalState.bike}
          onSave={handleSaveBike}
          onClose={() => setBikeModalState({ open: false, bike: null })}
        />
      )}

      {partModalState.open && (
        <PartModal
          part={partModalState.part}
          bikes={bikes}
          defaultBikeId={partModalState.defaultBikeId}
          onSave={handleSavePart}
          onClose={() =>
            setPartModalState({ open: false, part: null, defaultBikeId: null })
          }
        />
      )}

      {assignModalOpen && selectedBike && (
        <AssignPartModal
          bike={selectedBike}
          stockParts={stockParts}
          onAssignExisting={handleAssignExistingPart}
          onCreateForBike={(input) => handleSavePart(input)}
          onClose={() => setAssignModalOpen(false)}
        />
      )}

      {orderModalState.open && (
        <OrderModal
          orderItem={orderModalState.orderItem}
          prefill={orderModalState.prefill}
          bikes={bikes}
          onSave={handleSaveOrder}
          onClose={() =>
            setOrderModalState({ open: false, orderItem: null, prefill: null })
          }
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={
            confirmDelete.type === 'bike'
              ? 'Bike löschen'
              : confirmDelete.type === 'part'
                ? 'Teil löschen'
                : 'Bestellposten löschen'
          }
          message={
            confirmDelete.type === 'bike'
              ? `„${confirmDelete.item.name}“ wirklich löschen? Verbaute Teile werden automatisch ins Lager verschoben.`
              : `„${confirmDelete.item.name}“ unwiderruflich entfernen?`
          }
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
          busy={deleteBusy}
        />
      )}

      {backupModalOpen && (
        <BackupModal
          bikes={bikes}
          parts={parts}
          orderItems={orderItems}
          onImport={handleImportBackup}
          onExportSuccess={() => showToast('Backup heruntergeladen')}
          onClose={() => setBackupModalOpen(false)}
        />
      )}

      {updateModalOpen && (
        <UpdateModal
          systemStatus={systemStatus}
          onCheckRemote={() => api.checkForUpdates()}
          onApplyCatalog={handleApplyCatalogUpdate}
          onApplyPackage={handleApplyPackageUpdate}
          onCopyCommand={(cmd) => void handleCopyText(cmd, 'Update-Befehl kopiert')}
          onClose={() => setUpdateModalOpen(false)}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
}
