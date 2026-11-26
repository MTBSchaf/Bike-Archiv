export const PART_CATEGORIES = [
  'Rahmen',
  'Fahrwerk',
  'Antrieb',
  'Bremsen',
  'Laufräder & Reifen',
  'Cockpit & Sattel',
  'Sonstiges',
];

export const PART_STATUSES = ['in_use', 'in_stock', 'defective'];
export const ORDER_PRIORITIES = ['low', 'normal', 'high'];
export const ORDER_STATUSES = ['open', 'ordered', 'received'];

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

function assertObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Ungültige Eingabedaten.');
  }
}

function cleanString(value, fieldLabel, { required = false, maxLength = 500 } = {}) {
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

function cleanRequiredId(value, fieldLabel) {
  return cleanString(value, fieldLabel, { required: true, maxLength: 100 });
}

function cleanOptionalId(value, fieldLabel) {
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

function cleanTimestamp(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || Number.isNaN(Date.parse(trimmed))) {
    return fallback;
  }
  return trimmed;
}

function cleanOptionalYear(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1900 || num > 2100) {
    throw new ValidationError('Modelljahr muss eine gültige Jahreszahl zwischen 1900 und 2100 sein.');
  }
  return num;
}

function cleanOptionalPrice(value) {
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

function cleanQuantity(value) {
  if (value === undefined || value === null || value === '') {
    return 1;
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1 || num > 999) {
    throw new ValidationError('Menge muss eine ganze Zahl zwischen 1 und 999 sein.');
  }
  return num;
}

function cleanHttpUrl(value) {
  const str = cleanString(value, 'Shop-URL', { required: false, maxLength: 1000 });
  if (!str) {
    return '';
  }
  let parsed;
  try {
    parsed = new URL(str);
  } catch {
    throw new ValidationError('Shop-URL muss eine gültige URL sein.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Shop-URL darf nur http:// oder https:// verwenden.');
  }
  return parsed.toString();
}

function assertEnum(value, allowed, fieldLabel, defaultValue) {
  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ValidationError(`${fieldLabel} ist erforderlich.`);
  }
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(`Ungültiger Wert für ${fieldLabel}.`);
  }
  return value;
}

export function validateBikeSerialInput(body) {
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

export function validateBikeInput(body) {
  assertObject(body);
  const brand = cleanString(body.brand, 'Marke', { required: true, maxLength: 120 });
  const model = cleanString(body.model, 'Modell', { required: true, maxLength: 160 });
  const rawName = cleanString(body.name, 'Name', { required: false, maxLength: 200 });
  const name = rawName || `${brand} ${model}`.trim();

  let serials;
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
    category: cleanString(body.category, 'Kategorie', { required: false, maxLength: 100 }) || 'MTB',
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
    notes: cleanString(body.notes, 'Notizen', { required: false, maxLength: 2000 }),
    serials,
  };
}

export function validatePartInput(body) {
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
    specs: cleanString(body.specs, 'Spezifikation', { required: false, maxLength: 500 }),
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

export function validateOrderItemInput(body) {
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
    status: assertEnum(body.status, ORDER_STATUSES, 'Bestellstatus', 'open'),
    notes: cleanString(body.notes, 'Notizen', { required: false, maxLength: 2000 }),
  };
}

export function validateBackupPayload(raw) {
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
  const bikeIdSet = new Set();
  const serialIdSet = new Set();
  const partIdSet = new Set();
  const orderIdSet = new Set();

  const bikes = raw.bikes.map((entry) => {
    assertObject(entry);
    const id = cleanRequiredId(entry.id, 'Fahrrad-ID');
    if (bikeIdSet.has(id)) {
      throw new ValidationError(`Doppelte Fahrrad-ID im Backup: ${id}`);
    }
    bikeIdSet.add(id);

    const validatedBike = validateBikeInput(entry);
    const createdAt = cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow);
    const updatedAt = cleanTimestamp(entry.updatedAt ?? entry.updated_at, createdAt);

    const rawSerials = entry.serials ?? [];
    if (!Array.isArray(rawSerials)) {
      throw new ValidationError('Seriennummern müssen als Liste übergeben werden.');
    }
    if (rawSerials.length > 50) {
      throw new ValidationError('Maximal 50 zusätzliche Seriennummern pro Bike erlaubt.');
    }

    const serials = rawSerials.map((serialEntry) => {
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
      ...validatedBike,
      id,
      serials,
      createdAt,
      updatedAt,
    };
  });

  const parts = raw.parts.map((entry) => {
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
    }

    const createdAt = cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow);
    const updatedAt = cleanTimestamp(entry.updatedAt ?? entry.updated_at, createdAt);

    return {
      ...validatedPart,
      id,
      bikeId: validatedPart.status === 'in_use' ? validatedPart.bikeId : null,
      createdAt,
      updatedAt,
    };
  });

  const orderItems = raw.orderItems.map((entry) => {
    assertObject(entry);
    const id = cleanRequiredId(entry.id, 'Bestell-ID');
    if (orderIdSet.has(id)) {
      throw new ValidationError(`Doppelte Bestell-ID im Backup: ${id}`);
    }
    orderIdSet.add(id);

    const validatedOrder = validateOrderItemInput(entry);
    const createdAt = cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow);
    const updatedAt = cleanTimestamp(entry.updatedAt ?? entry.updated_at, createdAt);

    return {
      ...validatedOrder,
      id,
      bikeId:
        validatedOrder.bikeId && bikeIdSet.has(validatedOrder.bikeId)
          ? validatedOrder.bikeId
          : null,
      partId:
        validatedOrder.partId && partIdSet.has(validatedOrder.partId)
          ? validatedOrder.partId
          : null,
      createdAt,
      updatedAt,
    };
  });

  return { bikes, parts, orderItems };
}
