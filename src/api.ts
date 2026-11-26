import { localStore } from './localStore';
import type {
  Bike,
  BikeFormInput,
  BikeSerial,
  BootstrapPayload,
  OrderFormInput,
  OrderItem,
  Part,
  PartFormInput,
} from './types';

export type StorageMode = 'server' | 'local';

let resolvedMode: StorageMode | null = null;
let modeProbePromise: Promise<StorageMode> | null = null;

async function resolveBackendMode(): Promise<StorageMode> {
  if (resolvedMode !== null) {
    return resolvedMode;
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    resolvedMode = 'local';
    return 'local';
  }
  if (!modeProbePromise) {
    modeProbePromise = (async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          resolvedMode = 'local';
          return 'local';
        }
        const data = (await res.json().catch(() => null)) as { ok?: unknown } | null;
        resolvedMode = data && data.ok === true ? 'server' : 'local';
        return resolvedMode;
      } catch {
        resolvedMode = 'local';
        return 'local';
      }
    })();
  }
  return modeProbePromise;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('X-Bike-Archiv-Request', '1');
  }
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Anfrage fehlgeschlagen.');
  }
  return data as T;
}

export const api = {
  getStorageMode(): StorageMode {
    if (resolvedMode !== null) {
      return resolvedMode;
    }
    return 'local';
  },
  async getBootstrap(): Promise<BootstrapPayload> {
    if ((await resolveBackendMode()) === 'server') {
      return request<BootstrapPayload>('/api/bootstrap');
    }
    return localStore.getBootstrap();
  },
  async getBike(id: string): Promise<{ bike: Bike }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ bike: Bike }>(`/api/bikes/${encodeURIComponent(id)}`);
    }
    return localStore.getBike(id);
  },
  async createBike(input: BikeFormInput): Promise<{ bike: Bike }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ bike: Bike }>('/api/bikes', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }
    return localStore.createBike(input);
  },
  async updateBike(id: string, input: BikeFormInput): Promise<{ bike: Bike }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ bike: Bike }>(`/api/bikes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    }
    return localStore.updateBike(id, input);
  },
  async deleteBike(id: string): Promise<{ deleted: boolean }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ deleted: boolean }>(`/api/bikes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    }
    return localStore.deleteBike(id);
  },
  async addBikeSerial(
    bikeId: string,
    input: { label: string; serialNumber: string; notes: string },
  ): Promise<{ serial: BikeSerial }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ serial: BikeSerial }>(
        `/api/bikes/${encodeURIComponent(bikeId)}/serials`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
    }
    return localStore.addBikeSerial(bikeId, input);
  },
  async deleteBikeSerial(bikeId: string, serialId: string): Promise<{ deleted: boolean }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ deleted: boolean }>(
        `/api/bikes/${encodeURIComponent(bikeId)}/serials/${encodeURIComponent(serialId)}`,
        {
          method: 'DELETE',
        },
      );
    }
    return localStore.deleteBikeSerial(bikeId, serialId);
  },
  async createPart(input: PartFormInput): Promise<{ part: Part }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ part: Part }>('/api/parts', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }
    return localStore.createPart(input);
  },
  async updatePart(id: string, input: PartFormInput): Promise<{ part: Part }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ part: Part }>(`/api/parts/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    }
    return localStore.updatePart(id, input);
  },
  async deletePart(id: string): Promise<{ deleted: boolean }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ deleted: boolean }>(`/api/parts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    }
    return localStore.deletePart(id);
  },
  async createOrderItem(input: OrderFormInput): Promise<{ orderItem: OrderItem }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ orderItem: OrderItem }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }
    return localStore.createOrderItem(input);
  },
  async updateOrderItem(id: string, input: OrderFormInput): Promise<{ orderItem: OrderItem }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ orderItem: OrderItem }>(`/api/orders/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    }
    return localStore.updateOrderItem(id, input);
  },
  async deleteOrderItem(id: string): Promise<{ deleted: boolean }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ deleted: boolean }>(`/api/orders/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    }
    return localStore.deleteOrderItem(id);
  },
  async receiveOrderItemToStock(
    id: string,
  ): Promise<{ orderItem: OrderItem; part: Part }> {
    if ((await resolveBackendMode()) === 'server') {
      return request<{ orderItem: OrderItem; part: Part }>(
        `/api/orders/${encodeURIComponent(id)}/receive-to-stock`,
        {
          method: 'POST',
        },
      );
    }
    return localStore.receiveOrderItemToStock(id);
  },
  async importBackup(payload: unknown): Promise<BootstrapPayload> {
    if ((await resolveBackendMode()) === 'server') {
      return request<BootstrapPayload>('/api/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    return localStore.importBackup(payload);
  },
};
