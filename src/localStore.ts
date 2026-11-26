import {
  SPECIALIZED_STATUS_160_BIKE,
  SPECIALIZED_STATUS_160_ID,
  SPECIALIZED_STATUS_160_PARTS,
} from './initialSeed.ts';
import type {
  Bike,
  BikeFormInput,
  BikeSerial,
  BootstrapPayload,
  OrderFormInput,
  OrderItem,
  Part,
  PartFormInput,
} from './types.ts';
import {
  ValidationError,
  validateBackupPayload,
  validateBikeInput,
  validateBikeSerialInput,
  validateOrderItemInput,
  validatePartInput,
} from './validation.ts';

const STORAGE_KEY = 'bike-archiv:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredState {
  version: 1;
  seeded: boolean;
  bikes: Bike[];
  parts: Part[];
  orderItems: OrderItem[];
}

function generateId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createFallbackMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

function resolveDefaultStorage(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const testKey = '__bike_archiv_probe__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    }
  } catch {
    // Fallback to in-memory storage if localStorage is disabled or blocked
  }
  return createFallbackMemoryStorage();
}

function createInitialSeedState(): StoredState {
  const now = new Date().toISOString();
  const initialBike: Bike = {
    id: SPECIALIZED_STATUS_160_ID,
    name: SPECIALIZED_STATUS_160_BIKE.name,
    brand: SPECIALIZED_STATUS_160_BIKE.brand,
    model: SPECIALIZED_STATUS_160_BIKE.model,
    modelYear: SPECIALIZED_STATUS_160_BIKE.modelYear,
    category: SPECIALIZED_STATUS_160_BIKE.category,
    frameSize: SPECIALIZED_STATUS_160_BIKE.frameSize,
    wheelSize: SPECIALIZED_STATUS_160_BIKE.wheelSize,
    color: SPECIALIZED_STATUS_160_BIKE.color,
    serialNumber: SPECIALIZED_STATUS_160_BIKE.serialNumber,
    notes: SPECIALIZED_STATUS_160_BIKE.notes,
    partCount: SPECIALIZED_STATUS_160_PARTS.length,
    serials: [],
    createdAt: now,
    updatedAt: now,
  };

  const initialParts: Part[] = SPECIALIZED_STATUS_160_PARTS.map((part) => ({
    id: generateId(),
    name: part.name,
    brand: part.brand,
    category: part.category,
    specs: part.specs,
    serialNumber: '',
    status: 'in_use',
    bikeId: SPECIALIZED_STATUS_160_ID,
    bikeName: SPECIALIZED_STATUS_160_BIKE.name,
    notes: '',
    createdAt: now,
    updatedAt: now,
  }));

  return {
    version: 1,
    seeded: true,
    bikes: [initialBike],
    parts: initialParts,
    orderItems: [],
  };
}

function compareStringsAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortBikes(bikes: Bike[]): Bike[] {
  return [...bikes].sort(
    (a, b) => compareStringsAsc(a.createdAt, b.createdAt) || compareStringsAsc(a.name, b.name),
  );
}

function sortSerials(serials: BikeSerial[]): BikeSerial[] {
  return [...serials].sort(
    (a, b) => compareStringsAsc(a.createdAt, b.createdAt) || compareStringsAsc(a.label, b.label),
  );
}

const PART_STATUS_RANK = { in_use: 0, in_stock: 1, defective: 2 } as const;
const ORDER_STATUS_RANK = { open: 0, ordered: 1, received: 2 } as const;
const ORDER_PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

function sortParts(parts: Part[]): Part[] {
  return [...parts].sort(
    (a, b) =>
      PART_STATUS_RANK[a.status] - PART_STATUS_RANK[b.status] ||
      compareStringsAsc(a.category, b.category) ||
      compareStringsAsc(a.name, b.name),
  );
}

function sortOrderItems(orderItems: OrderItem[]): OrderItem[] {
  return [...orderItems].sort(
    (a, b) =>
      ORDER_STATUS_RANK[a.status] - ORDER_STATUS_RANK[b.status] ||
      ORDER_PRIORITY_RANK[a.priority] - ORDER_PRIORITY_RANK[b.priority] ||
      compareStringsAsc(b.createdAt, a.createdAt),
  );
}

function normalizeComputedFields(state: StoredState): StoredState {
  const bikeNameById = new Map(state.bikes.map((bike) => [bike.id, bike.name]));
  const partCountByBike = new Map<string, number>();

  const parts = state.parts.map((part) => {
    const validBikeId =
      part.status === 'in_use' && part.bikeId && bikeNameById.has(part.bikeId)
        ? part.bikeId
        : null;
    if (validBikeId) {
      partCountByBike.set(validBikeId, (partCountByBike.get(validBikeId) ?? 0) + 1);
    }
    return {
      ...part,
      bikeId: validBikeId,
      bikeName: validBikeId ? (bikeNameById.get(validBikeId) ?? null) : null,
    };
  });

  const partIdSet = new Set(parts.map((p) => p.id));

  const bikes = state.bikes.map((bike) => ({
    ...bike,
    partCount: partCountByBike.get(bike.id) ?? 0,
    serials: sortSerials(bike.serials),
  }));

  const orderItems = state.orderItems.map((item) => {
    const validBikeId = item.bikeId && bikeNameById.has(item.bikeId) ? item.bikeId : null;
    const validPartId = item.partId && partIdSet.has(item.partId) ? item.partId : null;
    return {
      ...item,
      bikeId: validBikeId,
      bikeName: validBikeId ? (bikeNameById.get(validBikeId) ?? null) : null,
      partId: validPartId,
    };
  });

  return {
    version: 1,
    seeded: true,
    bikes: sortBikes(bikes),
    parts: sortParts(parts),
    orderItems: sortOrderItems(orderItems),
  };
}

export function createLocalStore(customStorage?: StorageLike) {
  const storage = customStorage ?? resolveDefaultStorage();

  function saveState(state: StoredState): StoredState {
    const normalized = normalizeComputedFields(state);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      throw new Error(
        'Der Browser-Speicher ist voll oder blockiert. Bitte erst ein Backup exportieren.',
      );
    }
    return normalized;
  }

  function loadState(): StoredState {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialSeedState();
      return saveState(initial);
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StoredState>;
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray(parsed.bikes) &&
        Array.isArray(parsed.parts) &&
        Array.isArray(parsed.orderItems)
      ) {
        return normalizeComputedFields({
          version: 1,
          seeded: Boolean(parsed.seeded ?? true),
          bikes: parsed.bikes,
          parts: parsed.parts,
          orderItems: parsed.orderItems,
        });
      }
    } catch {
      // Corrupted state falls back to initial seed
    }

    const initial = createInitialSeedState();
    return saveState(initial);
  }

  function buildBikeDetail(state: StoredState, bikeId: string): Bike | null {
    const bike = state.bikes.find((b) => b.id === bikeId);
    if (!bike) return null;
    const parts = sortParts(
      state.parts.filter((p) => p.bikeId === bikeId && p.status === 'in_use'),
    );
    return {
      ...bike,
      serials: [...bike.serials],
      parts,
    };
  }

  return {
    getBootstrap(): BootstrapPayload {
      const state = loadState();
      return {
        bikes: state.bikes,
        parts: state.parts,
        orderItems: state.orderItems,
      };
    },

    getBike(id: string): { bike: Bike } {
      const state = loadState();
      const bike = buildBikeDetail(state, id);
      if (!bike) {
        throw new ValidationError('Fahrrad nicht gefunden.');
      }
      return { bike };
    },

    createBike(rawInput: BikeFormInput): { bike: Bike } {
      const input = validateBikeInput(rawInput);
      const state = loadState();
      const now = new Date().toISOString();
      const id = generateId();
      const serials: BikeSerial[] = (input.serials ?? []).map((entry) => ({
        id: generateId(),
        bikeId: id,
        label: entry.label,
        serialNumber: entry.serialNumber,
        notes: entry.notes,
        createdAt: now,
      }));

      const newBike: Bike = {
        id,
        name: input.name,
        brand: input.brand,
        model: input.model,
        modelYear: input.modelYear,
        category: input.category,
        frameSize: input.frameSize,
        wheelSize: input.wheelSize,
        color: input.color,
        serialNumber: input.serialNumber,
        notes: input.notes,
        partCount: 0,
        serials,
        createdAt: now,
        updatedAt: now,
      };

      const next = saveState({
        ...state,
        bikes: [...state.bikes, newBike],
      });
      const detail = buildBikeDetail(next, id);
      if (!detail) {
        throw new Error('Fahrrad konnte nicht gespeichert werden.');
      }
      return { bike: detail };
    },

    updateBike(id: string, rawInput: BikeFormInput): { bike: Bike } {
      const input = validateBikeInput(rawInput);
      const state = loadState();
      const existing = state.bikes.find((b) => b.id === id);
      if (!existing) {
        throw new ValidationError('Fahrrad nicht gefunden.');
      }
      const now = new Date().toISOString();
      const next = saveState({
        ...state,
        bikes: state.bikes.map((bike) =>
          bike.id === id
            ? {
                ...bike,
                name: input.name,
                brand: input.brand,
                model: input.model,
                modelYear: input.modelYear,
                category: input.category,
                frameSize: input.frameSize,
                wheelSize: input.wheelSize,
                color: input.color,
                serialNumber: input.serialNumber,
                notes: input.notes,
                updatedAt: now,
              }
            : bike,
        ),
      });
      const detail = buildBikeDetail(next, id);
      if (!detail) {
        throw new Error('Fahrrad konnte nicht aktualisiert werden.');
      }
      return { bike: detail };
    },

    deleteBike(id: string): { deleted: boolean } {
      const state = loadState();
      if (!state.bikes.some((b) => b.id === id)) {
        throw new ValidationError('Fahrrad nicht gefunden.');
      }
      const now = new Date().toISOString();
      saveState({
        ...state,
        bikes: state.bikes.filter((b) => b.id !== id),
        parts: state.parts.map((part) =>
          part.bikeId === id
            ? {
                ...part,
                status: 'in_stock',
                bikeId: null,
                bikeName: null,
                updatedAt: now,
              }
            : part,
        ),
        orderItems: state.orderItems.map((item) =>
          item.bikeId === id
            ? {
                ...item,
                bikeId: null,
                bikeName: null,
                updatedAt: now,
              }
            : item,
        ),
      });
      return { deleted: true };
    },

    addBikeSerial(
      bikeId: string,
      rawInput: { label: string; serialNumber: string; notes: string },
    ): { serial: BikeSerial } {
      const input = validateBikeSerialInput(rawInput);
      const state = loadState();
      const bike = state.bikes.find((b) => b.id === bikeId);
      if (!bike) {
        throw new ValidationError('Fahrrad nicht gefunden.');
      }
      const serial: BikeSerial = {
        id: generateId(),
        bikeId,
        label: input.label,
        serialNumber: input.serialNumber,
        notes: input.notes,
        createdAt: new Date().toISOString(),
      };
      saveState({
        ...state,
        bikes: state.bikes.map((b) =>
          b.id === bikeId ? { ...b, serials: [...b.serials, serial] } : b,
        ),
      });
      return { serial };
    },

    deleteBikeSerial(bikeId: string, serialId: string): { deleted: boolean } {
      const state = loadState();
      const bike = state.bikes.find((b) => b.id === bikeId);
      if (!bike || !bike.serials.some((s) => s.id === serialId)) {
        throw new ValidationError('Seriennummer nicht gefunden.');
      }
      saveState({
        ...state,
        bikes: state.bikes.map((b) =>
          b.id === bikeId
            ? { ...b, serials: b.serials.filter((s) => s.id !== serialId) }
            : b,
        ),
      });
      return { deleted: true };
    },

    createPart(rawInput: PartFormInput): { part: Part } {
      const input = validatePartInput(rawInput);
      const state = loadState();
      const targetBike = input.bikeId
        ? state.bikes.find((b) => b.id === input.bikeId)
        : null;
      if (input.bikeId && !targetBike) {
        throw new ValidationError('Das ausgewählte Fahrrad existiert nicht.');
      }
      const now = new Date().toISOString();
      const part: Part = {
        id: generateId(),
        name: input.name,
        brand: input.brand,
        category: input.category,
        specs: input.specs,
        serialNumber: input.serialNumber,
        status: input.status,
        bikeId: input.bikeId,
        bikeName: targetBike ? targetBike.name : null,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      const next = saveState({
        ...state,
        parts: [...state.parts, part],
      });
      const saved = next.parts.find((p) => p.id === part.id) ?? part;
      return { part: saved };
    },

    updatePart(id: string, rawInput: PartFormInput): { part: Part } {
      const input = validatePartInput(rawInput);
      const state = loadState();
      const existing = state.parts.find((p) => p.id === id);
      if (!existing) {
        throw new ValidationError('Teil nicht gefunden.');
      }
      const targetBike = input.bikeId
        ? state.bikes.find((b) => b.id === input.bikeId)
        : null;
      if (input.bikeId && !targetBike) {
        throw new ValidationError('Das ausgewählte Fahrrad existiert nicht.');
      }
      const now = new Date().toISOString();
      const next = saveState({
        ...state,
        parts: state.parts.map((part) =>
          part.id === id
            ? {
                ...part,
                name: input.name,
                brand: input.brand,
                category: input.category,
                specs: input.specs,
                serialNumber: input.serialNumber,
                status: input.status,
                bikeId: input.bikeId,
                bikeName: targetBike ? targetBike.name : null,
                notes: input.notes,
                updatedAt: now,
              }
            : part,
        ),
      });
      const saved = next.parts.find((p) => p.id === id);
      if (!saved) {
        throw new Error('Teil konnte nicht aktualisiert werden.');
      }
      return { part: saved };
    },

    deletePart(id: string): { deleted: boolean } {
      const state = loadState();
      if (!state.parts.some((p) => p.id === id)) {
        throw new ValidationError('Teil nicht gefunden.');
      }
      const now = new Date().toISOString();
      saveState({
        ...state,
        parts: state.parts.filter((p) => p.id !== id),
        orderItems: state.orderItems.map((item) =>
          item.partId === id ? { ...item, partId: null, updatedAt: now } : item,
        ),
      });
      return { deleted: true };
    },

    createOrderItem(rawInput: OrderFormInput): { orderItem: OrderItem } {
      const input = validateOrderItemInput(rawInput);
      const state = loadState();
      const targetBike = input.bikeId
        ? state.bikes.find((b) => b.id === input.bikeId)
        : null;
      if (input.bikeId && !targetBike) {
        throw new ValidationError('Das ausgewählte Fahrrad existiert nicht.');
      }
      const validPartId =
        input.partId && state.parts.some((p) => p.id === input.partId) ? input.partId : null;
      const now = new Date().toISOString();
      const orderItem: OrderItem = {
        id: generateId(),
        name: input.name,
        brand: input.brand,
        category: input.category,
        bikeId: input.bikeId,
        bikeName: targetBike ? targetBike.name : null,
        partId: validPartId,
        quantity: input.quantity,
        priority: input.priority,
        estimatedPrice: input.estimatedPrice,
        shopUrl: input.shopUrl,
        status: input.status,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      const next = saveState({
        ...state,
        orderItems: [...state.orderItems, orderItem],
      });
      const saved = next.orderItems.find((o) => o.id === orderItem.id) ?? orderItem;
      return { orderItem: saved };
    },

    updateOrderItem(id: string, rawInput: OrderFormInput): { orderItem: OrderItem } {
      const input = validateOrderItemInput(rawInput);
      const state = loadState();
      const existing = state.orderItems.find((o) => o.id === id);
      if (!existing) {
        throw new ValidationError('Bestellposten nicht gefunden.');
      }
      const targetBike = input.bikeId
        ? state.bikes.find((b) => b.id === input.bikeId)
        : null;
      if (input.bikeId && !targetBike) {
        throw new ValidationError('Das ausgewählte Fahrrad existiert nicht.');
      }
      const validPartId =
        input.partId && state.parts.some((p) => p.id === input.partId) ? input.partId : null;
      const now = new Date().toISOString();
      const next = saveState({
        ...state,
        orderItems: state.orderItems.map((item) =>
          item.id === id
            ? {
                ...item,
                name: input.name,
                brand: input.brand,
                category: input.category,
                bikeId: input.bikeId,
                bikeName: targetBike ? targetBike.name : null,
                partId: validPartId,
                quantity: input.quantity,
                priority: input.priority,
                estimatedPrice: input.estimatedPrice,
                shopUrl: input.shopUrl,
                status: input.status,
                notes: input.notes,
                updatedAt: now,
              }
            : item,
        ),
      });
      const saved = next.orderItems.find((o) => o.id === id);
      if (!saved) {
        throw new Error('Bestellposten konnte nicht aktualisiert werden.');
      }
      return { orderItem: saved };
    },

    deleteOrderItem(id: string): { deleted: boolean } {
      const state = loadState();
      if (!state.orderItems.some((o) => o.id === id)) {
        throw new ValidationError('Bestellposten nicht gefunden.');
      }
      saveState({
        ...state,
        orderItems: state.orderItems.filter((o) => o.id !== id),
      });
      return { deleted: true };
    },

    receiveOrderItemToStock(orderId: string): { orderItem: OrderItem; part: Part } {
      const state = loadState();
      const orderRow = state.orderItems.find((o) => o.id === orderId);
      if (!orderRow) {
        throw new ValidationError('Bestellposten nicht gefunden.');
      }
      const now = new Date().toISOString();
      const partId = generateId();
      const specs =
        orderRow.quantity > 1 ? `Bestellte Menge: ${orderRow.quantity}` : '';

      const newPart: Part = {
        id: partId,
        name: orderRow.name,
        brand: orderRow.brand,
        category: orderRow.category,
        specs,
        serialNumber: '',
        status: 'in_stock',
        bikeId: null,
        bikeName: null,
        notes: orderRow.notes,
        createdAt: now,
        updatedAt: now,
      };

      const next = saveState({
        ...state,
        parts: [...state.parts, newPart],
        orderItems: state.orderItems.map((item) =>
          item.id === orderId
            ? {
                ...item,
                partId,
                status: 'received',
                updatedAt: now,
              }
            : item,
        ),
      });

      const savedOrder = next.orderItems.find((o) => o.id === orderId);
      const savedPart = next.parts.find((p) => p.id === partId);
      if (!savedOrder || !savedPart) {
        throw new Error('Übernahme ins Lager fehlgeschlagen.');
      }
      return {
        orderItem: savedOrder,
        part: savedPart,
      };
    },

    importBackup(rawPayload: unknown): BootstrapPayload {
      const validated = validateBackupPayload(rawPayload);
      const saved = saveState({
        version: 1,
        seeded: true,
        bikes: validated.bikes,
        parts: validated.parts,
        orderItems: validated.orderItems,
      });
      return {
        bikes: saved.bikes,
        parts: saved.parts,
        orderItems: saved.orderItems,
      };
    },
  };
}

export const localStore = createLocalStore();
