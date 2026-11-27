export const PART_CATEGORIES = [
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

export const PART_STATUSES = ['in_use', 'in_stock', 'defective'];
export const ORDER_PRIORITIES = ['low', 'normal', 'high'];
export const ORDER_STATUSES = ['open', 'ordered', 'received'];

const ALLOWED_UPLOAD_MIMES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

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

function cleanOptionalHttpUrl(value, fieldLabel) {
  const str = cleanString(value, fieldLabel, { required: false, maxLength: 1000 });
  if (!str) {
    return '';
  }
  let parsed;
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

function cleanHttpUrl(value) {
  return cleanOptionalHttpUrl(value, 'Shop-URL');
}

function cleanImageUrl(value) {
  const str = cleanString(value, 'Bild-URL', { required: false, maxLength: 1000 });
  if (!str) {
    return '';
  }
  if (/^\/(images|uploads)\/[a-zA-Z0-9._/-]+$/.test(str) && !str.includes('..')) {
    return str;
  }
  let parsed;
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

function cleanStructuredSpecs(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      throw new ValidationError('Strukturierte Spezifikationen müssen als gültiges JSON-Array übergeben werden.');
    }
  }
  if (!Array.isArray(list)) {
    throw new ValidationError('Strukturierte Spezifikationen müssen als Liste übergeben werden.');
  }
  if (list.length > 30) {
    throw new ValidationError('Maximal 30 strukturierte Spezifikationen pro Teil erlaubt.');
  }
  const result = [];
  for (const entry of list) {
    assertObject(entry);
    const label = cleanString(entry.label, 'Eigenschaft', { required: false, maxLength: 120 });
    const val = cleanString(entry.value, 'Wert', { required: false, maxLength: 300 });
    if (!label && !val) {
      continue;
    }
    if (!label || !val) {
      throw new ValidationError('Jede strukturierte Spezifikation benötigt Eigenschaft und Wert.');
    }
    result.push({ label, value: val });
  }
  return result;
}

export function validateUploadPayload(body) {
  assertObject(body);
  const mimeType = cleanString(body.mimeType, 'MIME-Typ', { required: true, maxLength: 60 }).toLowerCase();
  const ext = ALLOWED_UPLOAD_MIMES.get(mimeType);
  if (!ext) {
    throw new ValidationError('Es sind nur Bilddateien im Format JPEG, PNG oder WebP erlaubt.');
  }
  const rawBase64 = cleanString(body.dataBase64, 'Bilddaten', { required: true, maxLength: 5 * 1024 * 1024 });
  const cleanedBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(cleanedBase64)) {
    throw new ValidationError('Ungültige Base64-Bilddaten.');
  }
  const buffer = Buffer.from(cleanedBase64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError('Bilddatei darf maximal 3 MB groß sein.');
  }

  let magicValid = false;
  if (mimeType === 'image/jpeg') {
    magicValid = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  } else if (mimeType === 'image/png') {
    magicValid =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
  } else if (mimeType === 'image/webp') {
    magicValid =
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  if (!magicValid) {
    throw new ValidationError('Die Bilddatei entspricht nicht dem angegebenen Dateiformat.');
  }

  return { buffer, ext, mimeType };
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
    imageUrl: cleanImageUrl(body.imageUrl ?? body.image_url),
    manufacturerUrl: cleanOptionalHttpUrl(
      body.manufacturerUrl ?? body.manufacturer_url,
      'Herstellerseite',
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
    subCategory: cleanString(
      body.subCategory ?? body.sub_category,
      'Unterkategorie',
      { required: false, maxLength: 120 },
    ),
    partNumber: cleanString(
      body.partNumber ?? body.part_number,
      'Teilenummer',
      { required: false, maxLength: 120 },
    ),
    quantity: cleanQuantity(body.quantity),
    specs: cleanString(body.specs, 'Spezifikation', { required: false, maxLength: 500 }),
    structuredSpecs: cleanStructuredSpecs(body.structuredSpecs ?? body.structured_specs),
    manufacturerUrl: cleanOptionalHttpUrl(
      body.manufacturerUrl ?? body.manufacturer_url,
      'Herstellerseite',
    ),
    imageUrl: cleanImageUrl(body.imageUrl ?? body.image_url),
    catalogKey: cleanString(
      body.catalogKey ?? body.catalog_key,
      'Katalog-Schlüssel',
      { required: false, maxLength: 120 },
    ),
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
    imageUrl: cleanImageUrl(body.imageUrl ?? body.image_url),
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

export function validateUpdatePackagePayload(raw) {
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

  const rawBikes = raw.bikes === undefined ? [] : raw.bikes;
  const rawParts = raw.parts === undefined ? [] : raw.parts;
  const rawOrderItems = raw.orderItems === undefined ? [] : raw.orderItems;

  if (!Array.isArray(rawBikes) || !Array.isArray(rawParts) || !Array.isArray(rawOrderItems)) {
    throw new ValidationError(
      'Update-Paket muss für „bikes“, „parts“ und „orderItems“ gültige Listen verwenden.',
    );
  }
  if (rawBikes.length === 0 && rawParts.length === 0 && rawOrderItems.length === 0) {
    throw new ValidationError('Update-Paket enthält keine zu aktualisierenden Einträge.');
  }
  if (rawBikes.length > 500 || rawParts.length > 5000 || rawOrderItems.length > 2000) {
    throw new ValidationError('Update-Paket überschreitet die zulässige Maximalgröße.');
  }

  const fallbackNow = new Date().toISOString();
  const bikes = rawBikes.map((entry) => {
    assertObject(entry);
    const id = cleanRequiredId(entry.id, 'Fahrrad-ID');
    const validatedBike = validateBikeInput(entry);
    const rawSerials = Array.isArray(entry.serials) ? entry.serials : [];
    const serials = rawSerials.map((serialEntry) => {
      assertObject(serialEntry);
      const serialId = cleanRequiredId(serialEntry.id, 'Seriennummern-ID');
      const validatedSerial = validateBikeSerialInput(serialEntry);
      return {
        id: serialId,
        bikeId: id,
        label: validatedSerial.label,
        serialNumber: validatedSerial.serialNumber,
        notes: validatedSerial.notes,
        createdAt: cleanTimestamp(serialEntry.createdAt ?? serialEntry.created_at, fallbackNow),
      };
    });
    return {
      ...validatedBike,
      id,
      serials,
      createdAt: cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow),
      updatedAt: cleanTimestamp(entry.updatedAt ?? entry.updated_at, fallbackNow),
    };
  });

  const parts = rawParts.map((entry) => {
    assertObject(entry);
    const id = cleanOptionalId(entry.id, 'Teile-ID');
    const validatedPart = validatePartInput(entry);
    if (!id && !validatedPart.catalogKey) {
      throw new ValidationError(
        `Teil „${validatedPart.name}“ im Update-Paket benötigt eine ID oder einen catalogKey.`,
      );
    }
    return {
      ...validatedPart,
      id: id || validatedPart.catalogKey,
      createdAt: cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow),
      updatedAt: cleanTimestamp(entry.updatedAt ?? entry.updated_at, fallbackNow),
    };
  });

  const orderItems = rawOrderItems.map((entry) => {
    assertObject(entry);
    const id = cleanRequiredId(entry.id, 'Bestell-ID');
    const validatedOrder = validateOrderItemInput(entry);
    return {
      ...validatedOrder,
      id,
      createdAt: cleanTimestamp(entry.createdAt ?? entry.created_at, fallbackNow),
      updatedAt: cleanTimestamp(entry.updatedAt ?? entry.updated_at, fallbackNow),
    };
  });

  return {
    updateId,
    version,
    description,
    bikes,
    parts,
    orderItems,
  };
}
