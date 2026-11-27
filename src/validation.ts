import type {
  Bike,
  BikeFormInput,
  BikeSerial,
  OrderFormInput,
  OrderItem,
  OrderPriority,
  OrderStatus,
  Part,
  PartCategory,
  PartFormInput,
  PartStatus,
  StructuredSpec,
} from './types.ts';

export const PART_CATEGORIES: PartCategory[] = [
  'Rahmen',
  'Fahrwerk',
  'Antrieb',
  'Bremsen',
  'Laufräder & Reifen',
  'Cockpit & Sattel',
  'Lager & Achsen',
  'Schrauben & Kleinteile',
  'Sonstiges',
];

export const PART_STATUSES: PartStatus[] = ['in_use', 'in_stock', 'defective'];
export const ORDER_PRIORITIES: OrderPriority[] = ['low', 'normal', 'high'];
export const ORDER_STATUSES: OrderStatus[] = ['open', 'ordered', 'received'];

export class ValidationError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

function assertObject(body: unknown): asserts body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Ungültige Eingabedaten.');
  }
}

function cleanString(
  value: unknown,
  fieldLabel: string,
  { required = false, maxLength = 500 }: { required?: boolean; maxLength?: number } = {},
): string {
  if (value === undefined || value === null) {
    if (required) {
      throw new ValidationError(`${fieldLabel} ist erforderlich.`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldLabel} muss ein Text sein.`);
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new ValidationError(`${fieldLabel} darf nicht leer sein.`);
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldLabel} darf maximal ${maxLength} Zeichen lang sein.`);
  }
  return trimmed;
}

function cleanRequiredId(value: unknown, fieldLabel: string): string {
  const id = cleanString(value, fieldLabel, { required: true, maxLength: 100 });
  return id;
}

function cleanOptionalId(value: unknown, fieldLabel: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldLabel} ist ungültig.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 100) {
    throw new ValidationError(`${fieldLabel} ist zu lang.`);
  }
  return trimmed;
}

function cleanTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || Number.isNaN(Date.parse(trimmed))) {
    return fallback;
  }
  return trimmed;
}

function cleanOptionalYear(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1900 || num > 2100) {
    throw new ValidationError(
      'Modelljahr muss eine gültige Jahreszahl zwischen 1900 und 2100 sein.',
    );
  }
  return num;
}

function cleanOptionalPrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0 || num > 1000000) {
    throw new ValidationError('Geschätzter Preis muss eine gültige positive Zahl sein.');
  }
  return Math.round(num * 100) / 100;
}

function cleanQuantity(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 1;
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1 || num > 999) {
    throw new ValidationError('Menge muss eine ganze Zahl zwischen 1 und 999 sein.');
  }
  return num;
}

function cleanOptionalHttpUrl(value: unknown, fieldLabel: string): string {
  const str = cleanString(value, fieldLabel, { required: false, maxLength: 1000 });
  if (!str) {
    return '';
  }
  let parsed: URL;
  try {
    parsed = new URL(str);
  } catch {
    throw new ValidationError(`${fieldLabel} muss eine gültige URL sein.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError(`${fieldLabel} darf nur http:// oder https:// verwenden.`);
  }
  return parsed.toString();
}

function cleanHttpUrl(value: unknown): string {
  return cleanOptionalHttpUrl(value, 'Shop-URL');
}

function cleanImageUrl(value: unknown): string {
  const str = cleanString(value, 'Bild-URL', { required: false, maxLength: 1000 });
  if (!str) {
    return '';
  }
  if (/^\/(images|uploads)\/[a-zA-Z0-9._/-]+$/.test(str) && !str.includes('..')) {
    return str;
  }
  let parsed: URL;
  try {
    parsed = new URL(str);
  } catch {
    throw new ValidationError('Bild-URL muss ein gültiger lokaler Bildpfad oder eine http(s)-URL sein.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Bild-URL darf nur /images/, /uploads/, http:// oder https:// verwenden.');
  }
  return parsed.toString();
}

function cleanStructuredSpecs(value: unknown): StructuredSpec[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      throw new ValidationError('Strukturierte Spezifikationen müssen gültiges JSON sein.');
    }
  }
  if (!Array.isArray(list)) {
    throw new ValidationError('Strukturierte Spezifikationen müssen eine Liste sein.');
  }
  if (list.length > 30) {
    throw new ValidationError('Maximal 30 strukturierte Spezifikationen erlaubt.');
  }
  const result: StructuredSpec[] = [];
  for (const entry of list) {
    assertObject(entry);
    const label = cleanString(entry.label, 'Eigenschaft', { required: false, maxLength: 120 });
    const val = cleanString(entry.value, 'Wert', { required: false, maxLength: 300 });
    if (!label && !val) continue;
    if (!label || !val) {
      throw new ValidationError('Jede Spezifikation benötigt Eigenschaft und Wert.');
    }
    result.push({ label, value: val });
  }
  return result;
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldLabel: string,
  defaultValue?: T,
): T {
  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ValidationError(`${fieldLabel} ist erforderlich.`);
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`Ungültiger Wert für ${fieldLabel}.`);
  }
  return value as T;
}

export function validateBikeSerialInput(body: unknown): {
  label: string;
  serialNumber: string;
  notes: string;
} {
  assertObject(body);
  return {
    label: cleanString(body.label, 'Bezeichnung', { required: true, maxLength: 120 }),
    serialNumber: cleanString(
      body.serialNumber ?? body.serial_number,
      'Seriennummer',
      { required: true, maxLength: 160 },
    ),
    notes: cleanString(body.notes, 'Notiz', { required: false, maxLength: 500 }),
  };
}

export function validateBikeInput(body: unknown): BikeFormInput {
  assertObject(body);
  const brand = cleanString(body.brand, 'Marke', { required: true, maxLength: 120 });
  const model = cleanString(body.model, 'Modell', { required: true, maxLength: 160 });
  const rawName = cleanString(body.name, 'Name', { required: false, maxLength: 200 });
  const name = rawName || `${brand} ${model}`.trim();

  let serials: Array<{ label: string; serialNumber: string; notes: string }> | undefined;
  if (body.serials !== undefined) {
    if (!Array.isArray(body.serials)) {
      throw new ValidationError('Seriennummern müssen als Liste übergeben werden.');
    }
    if (body.serials.length > 50) {
      throw new ValidationError('Maximal 50 zusätzliche Seriennummern pro Bike erlaubt.');
    }
    serials = body.serials.map((entry) => validateBikeSerialInput(entry));
  }

  return {
    name,
    brand,
    model,
    modelYear: cleanOptionalYear(body.modelYear ?? body.model_year),
    category:
      cleanString(body.category, 'Kategorie', { required: false, maxLength: 100 }) || 'MTB',
    frameSize: cleanString(body.frameSize ?? body.frame_size, 'Rahmengröße', {
      required: false,
      maxLength: 60,
    }),
    wheelSize: cleanString(body.wheelSize ?? body.wheel_size, 'Laufradgröße', {
      required: false,
      maxLength: 80,
    }),
    color: cleanString(body.color, 'Farbe', { required: false, maxLength: 120 }),
    serialNumber: cleanString(
      body.serialNumber ?? body.serial_number,
      'Rahmennummer',
      { required: false, maxLength: 160 },
    ),
    imageUrl: cleanImageUrl(body.imageUrl ?? body.image_url),
    manufacturerUrl: cleanOptionalHttpUrl(
      body.manufacturerUrl ?? body.manufacturer_url,
      'Herstellerseite',
    ),
    notes: cleanString(body.notes, 'Notizen', { required: false, maxLength: 2000 }),
    serials,
  };
}

export function validatePartInput(body: unknown): PartFormInput {
  assertObject(body);
  const status = assertEnum(body.status, PART_STATUSES, 'Status');
  const rawBikeId = cleanOptionalId(body.bikeId ?? body.bike_id, 'Fahrrad-ID');

  if (status === 'in_use' && !rawBikeId) {
    throw new ValidationError(
      'Für Teile mit Status „In Verwendung“ muss ein Fahrrad ausgewählt werden.',
    );
  }

  const bikeId = status === 'in_use' ? rawBikeId : null;

  return {
    name: cleanString(body.name, 'Teilebezeichnung', { required: true, maxLength: 200 }),
    brand: cleanString(body.brand, 'Hersteller', { required: false, maxLength: 120 }),
    category: assertEnum(body.category, PART_CATEGORIES, 'Kategorie', 'Sonstiges'),
    subCategory: cleanString(body.subCategory ?? body.sub_category, 'Unterkategorie', {
      required: false,
      maxLength: 120,
    }),
    partNumber: cleanString(body.partNumber ?? body.part_number, 'Teilenummer', {
      required: false,
      maxLength: 120,
    }),
    quantity: cleanQuantity(body.quantity),
    specs: cleanString(body.specs, 'Spezifikation', { required: false, maxLength: 500 }),
    structuredSpecs: cleanStructuredSpecs(body.structuredSpecs ?? body.structured_specs),
    manufacturerUrl: cleanOptionalHttpUrl(
      body.manufacturerUrl ?? body.manufacturer_url,
      'Herstellerseite',
    ),
    imageUrl: cleanImageUrl(body.imageUrl ?? body.image_url),
    catalogKey: cleanString(body.catalogKey ?? body.catalog_key, 'Katalog-Schlüssel', {
      required: false,
      maxLength: 120,
    }),
    serialNumber: cleanString(
      body.serialNumber ?? body.serial_number,
      'Seriennummer',
      { required: false, maxLength: 160 },
    ),
    status,
    bikeId,
    notes: cleanString(body.notes, 'Notizen', { required: false, maxLength: 2000 }),
  };
}

export function validateOrderItemInput(body: unknown): OrderFormInput {
  assertObject(body);
  return {
    name: cleanString(body.name, 'Artikelbezeichnung', { required: true, maxLength: 200 }),
    brand: cleanString(body.brand, 'Hersteller', { required: false, maxLength: 120 }),
    category: assertEnum(body.category, PART_CATEGORIES, 'Kategorie', 'Sonstiges'),
    bikeId: cleanOptionalId(body.bikeId ?? body.bike_id, 'Fahrrad-ID'),
    partId: cleanOptionalId(body.partId ?? body.part_id, 'Teile-ID'),
    quantity: cleanQuantity(body.quantity),
    priority: assertEnum(body.priority, ORDER_PRIORITIES, 'Priorität', 'normal'),
    estimatedPrice: cleanOptionalPrice(body.estimatedPrice ?? body.estimated_price),
    shopUrl: cleanHttpUrl(body.shopUrl ?? body.shop_url),
    imageUrl: cleanImageUrl(body.imageUrl ?? body.image_url),
    status: assertEnum(body.status, ORDER_STATUSES, 'Bestellstatus', 'open'),
    notes: cleanString(body.notes, 'Notizen', { required: false, maxLength: 2000 }),
  };
}

export interface ValidatedBackupPayload {
  bikes: Bike[];
  parts: Part[];
  orderItems: OrderItem[];
}

export function validateBackupPayload(raw: unknown): ValidatedBackupPayload {
  assertObject(raw);
  if (!Array.isArray(raw.bikes) || !Array.isArray(raw.parts) || !Array.isArray(raw.orderItems)) {
    throw new ValidationError(
      'Backup-Datei muss die Listen „bikes“, „parts“ und „orderItems“ enthalten.',
    );
  }
  if (raw.bikes.length > 500) {
    throw new ValidationError('Backup darf maximal 500 Bikes enthalten.');
  }
  if (raw.parts.length > 5000) {
    throw new ValidationError('Backup darf maximal 5000 Teile enthalten.');
  }
  if (raw.orderItems.length > 2000) {
    throw new ValidationError('Backup darf maximal 2000 Bestellposten enthalten.');
  }

  const fallbackNow = new Date().toISOString();
  const bikeIdSet = new Set<string>();
  const bikeNameById = new Map<string, string>();
  const serialIdSet = new Set<string>();
  const partIdSet = new Set<string>();
  const orderIdSet = new Set<string>();

  const bikes: Bike[] = raw.bikes.map((entry) => {
    assertObject(entry);
    const id = cleanRequiredId(entry.id, 'Fahrrad-ID');
    if (bikeIdSet.has(id)) {
      throw new ValidationError(`Doppelte Fahrrad-ID im Backup: ${id}`);
    }
    bikeIdSet.add(id);

    const validatedBike = validateBikeInput(entry);
    bikeNameById.set(id, validatedBike.name);

    const createdAt = cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow);
    const updatedAt = cleanTimestamp(entry.updatedAt ?? entry.updated_at, createdAt);

    const rawSerials = entry.serials ?? [];
    if (!Array.isArray(rawSerials)) {
      throw new ValidationError('Seriennummern müssen als Liste übergeben werden.');
    }
    if (rawSerials.length > 50) {
      throw new ValidationError('Maximal 50 zusätzliche Seriennummern pro Bike erlaubt.');
    }

    const serials: BikeSerial[] = rawSerials.map((serialEntry) => {
      assertObject(serialEntry);
      const serialId = cleanRequiredId(serialEntry.id, 'Seriennummern-ID');
      if (serialIdSet.has(serialId)) {
        throw new ValidationError(`Doppelte Seriennummern-ID im Backup: ${serialId}`);
      }
      serialIdSet.add(serialId);
      const validatedSerial = validateBikeSerialInput(serialEntry);
      return {
        id: serialId,
        bikeId: id,
        label: validatedSerial.label,
        serialNumber: validatedSerial.serialNumber,
        notes: validatedSerial.notes,
        createdAt: cleanTimestamp(serialEntry.createdAt ?? serialEntry.created_at, createdAt),
      };
    });

    return {
      id,
      name: validatedBike.name,
      brand: validatedBike.brand,
      model: validatedBike.model,
      modelYear: validatedBike.modelYear,
      category: validatedBike.category,
      frameSize: validatedBike.frameSize,
      wheelSize: validatedBike.wheelSize,
      color: validatedBike.color,
      serialNumber: validatedBike.serialNumber,
      imageUrl: validatedBike.imageUrl,
      manufacturerUrl: validatedBike.manufacturerUrl,
      notes: validatedBike.notes,
      partCount: 0,
      serials,
      createdAt,
      updatedAt,
    };
  });

  const partCountByBike = new Map<string, number>();

  const parts: Part[] = raw.parts.map((entry) => {
    assertObject(entry);
    const id = cleanRequiredId(entry.id, 'Teile-ID');
    if (partIdSet.has(id)) {
      throw new ValidationError(`Doppelte Teile-ID im Backup: ${id}`);
    }
    partIdSet.add(id);

    const validatedPart = validatePartInput(entry);
    if (validatedPart.status === 'in_use') {
      if (!validatedPart.bikeId || !bikeIdSet.has(validatedPart.bikeId)) {
        throw new ValidationError(
          `Teil „${validatedPart.name}“ verweist auf ein unbekanntes Fahrrad.`,
        );
      }
      partCountByBike.set(
        validatedPart.bikeId,
        (partCountByBike.get(validatedPart.bikeId) ?? 0) + 1,
      );
    }

    const bikeId = validatedPart.status === 'in_use' ? validatedPart.bikeId : null;
    const createdAt = cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow);
    const updatedAt = cleanTimestamp(entry.updatedAt ?? entry.updated_at, createdAt);

    return {
      id,
      name: validatedPart.name,
      brand: validatedPart.brand,
      category: validatedPart.category,
      subCategory: validatedPart.subCategory,
      partNumber: validatedPart.partNumber,
      quantity: validatedPart.quantity,
      specs: validatedPart.specs,
      structuredSpecs: validatedPart.structuredSpecs,
      manufacturerUrl: validatedPart.manufacturerUrl,
      imageUrl: validatedPart.imageUrl,
      catalogKey: validatedPart.catalogKey ?? '',
      serialNumber: validatedPart.serialNumber,
      status: validatedPart.status,
      bikeId,
      bikeName: bikeId ? (bikeNameById.get(bikeId) ?? null) : null,
      notes: validatedPart.notes,
      createdAt,
      updatedAt,
    };
  });

  for (const bike of bikes) {
    bike.partCount = partCountByBike.get(bike.id) ?? 0;
  }

  const orderItems: OrderItem[] = raw.orderItems.map((entry) => {
    assertObject(entry);
    const id = cleanRequiredId(entry.id, 'Bestell-ID');
    if (orderIdSet.has(id)) {
      throw new ValidationError(`Doppelte Bestell-ID im Backup: ${id}`);
    }
    orderIdSet.add(id);

    const validatedOrder = validateOrderItemInput(entry);
    const bikeId =
      validatedOrder.bikeId && bikeIdSet.has(validatedOrder.bikeId)
        ? validatedOrder.bikeId
        : null;
    const partId =
      validatedOrder.partId && partIdSet.has(validatedOrder.partId)
        ? validatedOrder.partId
        : null;
    const createdAt = cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow);
    const updatedAt = cleanTimestamp(entry.updatedAt ?? entry.updated_at, createdAt);

    return {
      id,
      name: validatedOrder.name,
      brand: validatedOrder.brand,
      category: validatedOrder.category,
      bikeId,
      bikeName: bikeId ? (bikeNameById.get(bikeId) ?? null) : null,
      partId,
      quantity: validatedOrder.quantity,
      priority: validatedOrder.priority,
      estimatedPrice: validatedOrder.estimatedPrice,
      shopUrl: validatedOrder.shopUrl,
      imageUrl: validatedOrder.imageUrl,
      status: validatedOrder.status,
      notes: validatedOrder.notes,
      createdAt,
      updatedAt,
    };
  });

  return { bikes, parts, orderItems };
}

export interface ValidatedUpdatePackagePreview {
  updateId: string;
  version: string;
  description: string;
  bikesCount: number;
  partsCount: number;
  orderItemsCount: number;
}

export function validateUpdatePackagePreview(raw: unknown): ValidatedUpdatePackagePreview {
  assertObject(raw);
  const updateId = cleanString(raw.updateId ?? raw.id, 'Update-ID', {
    required: true,
    maxLength: 120,
  });
  const version = cleanString(raw.version, 'Version', {
    required: true,
    maxLength: 40,
  });
  const description = cleanString(raw.description, 'Beschreibung', {
    required: false,
    maxLength: 500,
  });

  const bikes = raw.bikes === undefined ? [] : raw.bikes;
  const parts = raw.parts === undefined ? [] : raw.parts;
  const orderItems = raw.orderItems === undefined ? [] : raw.orderItems;

  if (!Array.isArray(bikes) || !Array.isArray(parts) || !Array.isArray(orderItems)) {
    throw new ValidationError('Update-Paket muss gültige Listen für bikes, parts und orderItems enthalten.');
  }
  if (bikes.length === 0 && parts.length === 0 && orderItems.length === 0) {
    throw new ValidationError('Update-Paket enthält keine zu aktualisierenden Einträge.');
  }

  return {
    updateId,
    version,
    description,
    bikesCount: bikes.length,
    partsCount: parts.length,
    orderItemsCount: orderItems.length,
  };
}
