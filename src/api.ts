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

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('X-Bike-Archiv-Request', '1');
  }
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      method,
      headers,
    });
  } catch {
    throw new Error(
      'Verbindung zum Server fehlgeschlagen. Bitte prüfen, ob der Bike-Archiv-Server läuft.',
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const isJsonContent = contentType.includes('application/json');

  let data: Record<string, unknown> | null = null;
  if (isJsonContent) {
    data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  } else {
    const rawText = await response.text().catch(() => '');
    if (rawText) {
      try {
        data = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        data = null;
      }
    }
  }

  if (!response.ok) {
    const errorMessage =
      data && typeof data.error === 'string' && data.error
        ? data.error
        : 'Serveranfrage fehlgeschlagen.';
    throw new Error(errorMessage);
  }

  if (data === null) {
    throw new Error(
      'Ungültige Serverantwort. Bike Archiv erfordert den laufenden Node.js-Server.',
    );
  }

  return data as T;
}

export const api = {
  getBootstrap(): Promise<BootstrapPayload> {
    return request<BootstrapPayload>('/api/bootstrap');
  },
  getBike(id: string): Promise<{ bike: Bike }> {
    return request<{ bike: Bike }>(`/api/bikes/${encodeURIComponent(id)}`);
  },
  createBike(input: BikeFormInput): Promise<{ bike: Bike }> {
    return request<{ bike: Bike }>('/api/bikes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateBike(id: string, input: BikeFormInput): Promise<{ bike: Bike }> {
    return request<{ bike: Bike }>(`/api/bikes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteBike(id: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/api/bikes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  addBikeSerial(
    bikeId: string,
    input: { label: string; serialNumber: string; notes: string },
  ): Promise<{ serial: BikeSerial }> {
    return request<{ serial: BikeSerial }>(
      `/api/bikes/${encodeURIComponent(bikeId)}/serials`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },
  deleteBikeSerial(bikeId: string, serialId: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(
      `/api/bikes/${encodeURIComponent(bikeId)}/serials/${encodeURIComponent(serialId)}`,
      {
        method: 'DELETE',
      },
    );
  },
  createPart(input: PartFormInput): Promise<{ part: Part }> {
    return request<{ part: Part }>('/api/parts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updatePart(id: string, input: PartFormInput): Promise<{ part: Part }> {
    return request<{ part: Part }>(`/api/parts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deletePart(id: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/api/parts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  createOrderItem(input: OrderFormInput): Promise<{ orderItem: OrderItem }> {
    return request<{ orderItem: OrderItem }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateOrderItem(id: string, input: OrderFormInput): Promise<{ orderItem: OrderItem }> {
    return request<{ orderItem: OrderItem }>(`/api/orders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteOrderItem(id: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/api/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  receiveOrderItemToStock(
    id: string,
  ): Promise<{ orderItem: OrderItem; part: Part }> {
    return request<{ orderItem: OrderItem; part: Part }>(
      `/api/orders/${encodeURIComponent(id)}/receive-to-stock`,
      {
        method: 'POST',
      },
    );
  },
  importBackup(payload: unknown): Promise<BootstrapPayload> {
    return request<BootstrapPayload>('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
