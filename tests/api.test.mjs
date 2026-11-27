import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../server/db.mjs';
import {
  applyCatalogUpdates,
  seedInitialData,
  SPECIALIZED_STATUS_160_ID,
  SPECIALIZED_STATUS_160_PARTS,
} from '../server/seed.mjs';
import { createAppServer } from '../server/app.mjs';

async function startTestServer({ uploadsDir = null } = {}) {
  const db = createDatabase(':memory:');
  seedInitialData(db);
  const server = createAppServer({ db, serveStatic: false, uploadsDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    db,
    server,
    baseUrl,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

async function apiFetch(baseUrl, path, { method = 'GET', body, includeCsrf = true } = {}) {
  const headers = {};
  if (includeCsrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-Bike-Archiv-Request'] = '1';
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

test('Initialer Seed enthält Specialized Status 160 mit allen 60 verbauten Teilen, Bildern und Herstellerdaten', async () => {
  const ctx = await startTestServer();
  try {
    const { res, data } = await apiFetch(ctx.baseUrl, '/api/bootstrap');
    assert.equal(res.status, 200);
    assert.equal(data.bikes.length, 1);
    const bike = data.bikes[0];
    assert.equal(bike.id, SPECIALIZED_STATUS_160_ID);
    assert.equal(bike.name, 'Specialized Status 160');
    assert.equal(bike.imageUrl, '/images/bikes/specialized-status-160.svg');
    assert.match(bike.manufacturerUrl, /^https:\/\/www\.specialized\.com\//);
    assert.equal(SPECIALIZED_STATUS_160_PARTS.length, 60);
    assert.equal(bike.partCount, 60);
    assert.equal(data.parts.length, 60);

    for (const part of data.parts) {
      assert.equal(part.status, 'in_use');
      assert.equal(part.bikeId, SPECIALIZED_STATUS_160_ID);
      assert.equal(part.bikeName, 'Specialized Status 160');
      assert.ok(part.imageUrl.startsWith('/images/parts/'), `Bild fehlt bei ${part.name}`);
      assert.ok(Array.isArray(part.structuredSpecs) && part.structuredSpecs.length >= 3, `Specs fehlen bei ${part.name}`);
      assert.match(part.manufacturerUrl, /^https:\/\//, `Hersteller-URL fehlt bei ${part.name}`);
    }

    // Idempotenz prüfen
    seedInitialData(ctx.db);
    assert.equal(ctx.db.listBikes().length, 1);
    assert.equal(ctx.db.listParts().length, 60);
  } finally {
    await ctx.close();
  }
});

test('Bike mit konkreter Rahmennummer und zusätzlichen Seriennummern verwalten & sicher löschen', async () => {
  const ctx = await startTestServer();
  try {
    const createRes = await apiFetch(ctx.baseUrl, '/api/bikes', {
      method: 'POST',
      body: {
        brand: "Canyon",
        model: "Spectral CF 8 'Test'",
        modelYear: 2024,
        category: 'Trail',
        frameSize: 'L',
        wheelSize: '29"',
        serialNumber: 'M07801B23K0199',
        serials: [
          { label: 'Gabel-Seriennummer', serialNumber: 'FOX-36-998877', notes: '' },
        ],
      },
    });
    assert.equal(createRes.res.status, 201);
    const createdBike = createRes.data.bike;
    assert.equal(createdBike.serialNumber, 'M07801B23K0199');
    assert.equal(createdBike.serials.length, 1);
    assert.equal(createdBike.serials[0].serialNumber, 'FOX-36-998877');

    // Zusätzliche Seriennummer anlegen
    const addSerialRes = await apiFetch(
      ctx.baseUrl,
      `/api/bikes/${createdBike.id}/serials`,
      {
        method: 'POST',
        body: { label: 'Dämpfer-Seriennummer', serialNumber: 'FOX-DPX-4455' },
      },
    );
    assert.equal(addSerialRes.res.status, 201);
    const serialId = addSerialRes.data.serial.id;

    // Teil in neuem Bike verbauen
    const partRes = await apiFetch(ctx.baseUrl, '/api/parts', {
      method: 'POST',
      body: {
        name: "Shimano XT Schaltwerk '12-fach'",
        brand: 'Shimano',
        category: 'Antrieb',
        status: 'in_use',
        bikeId: createdBike.id,
      },
    });
    assert.equal(partRes.res.status, 201);
    const partId = partRes.data.part.id;

    // Einzelansicht enthält Teil & beide Seriennummern
    const detailRes = await apiFetch(ctx.baseUrl, `/api/bikes/${createdBike.id}`);
    assert.equal(detailRes.res.status, 200);
    assert.equal(detailRes.data.bike.serials.length, 2);
    assert.equal(detailRes.data.bike.parts.length, 1);

    // Seriennummer entfernen
    const delSerialRes = await apiFetch(
      ctx.baseUrl,
      `/api/bikes/${createdBike.id}/serials/${serialId}`,
      { method: 'DELETE' },
    );
    assert.equal(delSerialRes.res.status, 200);

    // Bike löschen -> verbautes Teil geht sauber zurück ins Lager
    const delBikeRes = await apiFetch(ctx.baseUrl, `/api/bikes/${createdBike.id}`, {
      method: 'DELETE',
    });
    assert.equal(delBikeRes.res.status, 200);

    const partsRes = await apiFetch(ctx.baseUrl, '/api/parts');
    const releasedPart = partsRes.data.parts.find((p) => p.id === partId);
    assert.ok(releasedPart);
    assert.equal(releasedPart.status, 'in_stock');
    assert.equal(releasedPart.bikeId, null);
    assert.equal(releasedPart.bikeName, null);
  } finally {
    await ctx.close();
  }
});

test('Teile-Status-Invarianten: in_use braucht Bike, Statuswechsel auf Lager/Defekt leert bikeId', async () => {
  const ctx = await startTestServer();
  try {
    // in_use ohne bikeId -> 400
    const badRes = await apiFetch(ctx.baseUrl, '/api/parts', {
      method: 'POST',
      body: {
        name: 'Test-Vorbau',
        category: 'Cockpit & Sattel',
        status: 'in_use',
        bikeId: null,
      },
    });
    assert.equal(badRes.res.status, 400);

    // in_use mit gültiger bikeId -> 201 und sichtbar in parts & bike detail
    const okRes = await apiFetch(ctx.baseUrl, '/api/parts', {
      method: 'POST',
      body: {
        name: 'Burgtec Enduro MK3 Vorbau',
        brand: 'Burgtec',
        category: 'Cockpit & Sattel',
        status: 'in_use',
        bikeId: SPECIALIZED_STATUS_160_ID,
      },
    });
    assert.equal(okRes.res.status, 201);
    const createdPart = okRes.data.part;
    assert.equal(createdPart.bikeName, 'Specialized Status 160');

    const bikeDetail = await apiFetch(
      ctx.baseUrl,
      `/api/bikes/${SPECIALIZED_STATUS_160_ID}`,
    );
    assert.ok(bikeDetail.data.bike.parts.some((p) => p.id === createdPart.id));

    // Wechsel auf defective leert bikeId
    const defectRes = await apiFetch(ctx.baseUrl, `/api/parts/${createdPart.id}`, {
      method: 'PUT',
      body: {
        name: createdPart.name,
        brand: createdPart.brand,
        category: createdPart.category,
        status: 'defective',
        bikeId: SPECIALIZED_STATUS_160_ID,
      },
    });
    assert.equal(defectRes.res.status, 200);
    assert.equal(defectRes.data.part.status, 'defective');
    assert.equal(defectRes.data.part.bikeId, null);
    assert.equal(defectRes.data.part.bikeName, null);
  } finally {
    await ctx.close();
  }
});

test('Bestellliste CRUD und Übernahme ins Lager', async () => {
  const ctx = await startTestServer();
  try {
    const createOrder = await apiFetch(ctx.baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        name: 'SRAM Code R Bremsbeläge Sinter',
        brand: 'SRAM',
        category: 'Bremsen',
        bikeId: SPECIALIZED_STATUS_160_ID,
        quantity: 2,
        priority: 'high',
        estimatedPrice: 24.5,
        shopUrl: 'https://www.bike-components.de/de/',
      },
    });
    assert.equal(createOrder.res.status, 201);
    const orderId = createOrder.data.orderItem.id;

    const receiveRes = await apiFetch(
      ctx.baseUrl,
      `/api/orders/${orderId}/receive-to-stock`,
      { method: 'POST' },
    );
    assert.equal(receiveRes.res.status, 200);
    assert.equal(receiveRes.data.orderItem.status, 'received');
    assert.equal(receiveRes.data.part.status, 'in_stock');
    assert.equal(receiveRes.data.part.bikeId, null);
    assert.equal(receiveRes.data.part.name, 'SRAM Code R Bremsbeläge Sinter');
  } finally {
    await ctx.close();
  }
});

test('Security-Checks: CSRF-Header, Shop-URL-Validierung und Security-Header', async () => {
  const ctx = await startTestServer();
  try {
    const health = await apiFetch(ctx.baseUrl, '/api/health');
    assert.equal(health.res.status, 200);
    assert.equal(health.res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.res.headers.get('x-frame-options'), 'DENY');
    assert.ok(health.res.headers.get('content-security-policy'));

    // Fehlender CSRF-Header -> 403
    const noCsrf = await apiFetch(ctx.baseUrl, '/api/bikes', {
      method: 'POST',
      includeCsrf: false,
      body: { brand: 'Test', model: 'Bike' },
    });
    assert.equal(noCsrf.res.status, 403);

    // javascript:-URL -> 400
    const badUrl = await apiFetch(ctx.baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        name: 'Testteil',
        shopUrl: 'javascript:alert(1)',
      },
    });
    assert.equal(badUrl.res.status, 400);
  } finally {
    await ctx.close();
  }
});

test('Backup-Import über POST /api/import ersetzt Bestand konsistent und validiert Eingaben', async () => {
  const ctx = await startTestServer();
  try {
    // Fehlender CSRF-Header -> 403
    const noCsrf = await apiFetch(ctx.baseUrl, '/api/import', {
      method: 'POST',
      includeCsrf: false,
      body: { bikes: [], parts: [], orderItems: [] },
    });
    assert.equal(noCsrf.res.status, 403);

    // Ungültige javascript:-URL -> 400
    const badUrlImport = await apiFetch(ctx.baseUrl, '/api/import', {
      method: 'POST',
      body: {
        bikes: [],
        parts: [],
        orderItems: [
          {
            id: 'order-bad',
            name: 'Bremsbeläge',
            category: 'Bremsen',
            quantity: 1,
            priority: 'normal',
            status: 'open',
            shopUrl: 'javascript:alert(1)',
          },
        ],
      },
    });
    assert.equal(badUrlImport.res.status, 400);

    // in_use ohne existierendes Bike -> 400
    const badRefImport = await apiFetch(ctx.baseUrl, '/api/import', {
      method: 'POST',
      body: {
        bikes: [],
        parts: [
          {
            id: 'part-orphan',
            name: 'Vorbau',
            category: 'Cockpit & Sattel',
            status: 'in_use',
            bikeId: 'non-existent-bike',
          },
        ],
        orderItems: [],
      },
    });
    assert.equal(badRefImport.res.status, 400);

    // Gültiger Import ersetzt Bestand vollständig
    const validImport = await apiFetch(ctx.baseUrl, '/api/import', {
      method: 'POST',
      body: {
        bikes: [
          {
            id: 'bike-import-1',
            brand: 'Santa Cruz',
            model: 'Hightower',
            modelYear: 2024,
            category: 'Trail',
            serialNumber: 'SC-HT-1234',
            serials: [
              {
                id: 'ser-import-1',
                label: 'Gabel',
                serialNumber: 'RS-LYRIK-77',
                notes: '',
              },
            ],
          },
        ],
        parts: [
          {
            id: 'part-import-1',
            name: 'RockShox Lyrik Ultimate',
            brand: 'RockShox',
            category: 'Fahrwerk',
            status: 'in_use',
            bikeId: 'bike-import-1',
          },
        ],
        orderItems: [
          {
            id: 'order-import-1',
            name: 'Dichtkit',
            category: 'Fahrwerk',
            bikeId: 'bike-import-1',
            partId: 'part-import-1',
            quantity: 1,
            priority: 'high',
            status: 'open',
            shopUrl: 'https://example.com/kit',
          },
        ],
      },
    });
    assert.equal(validImport.res.status, 200);
    assert.equal(validImport.data.bikes.length, 1);
    assert.equal(validImport.data.bikes[0].id, 'bike-import-1');
    assert.equal(validImport.data.bikes[0].partCount, 1);
    assert.equal(validImport.data.bikes[0].serials.length, 1);
    assert.equal(validImport.data.parts.length, 1);
    assert.equal(validImport.data.parts[0].bikeName, 'Santa Cruz Hightower');
    assert.equal(validImport.data.orderItems.length, 1);

    const bootstrap = await apiFetch(ctx.baseUrl, '/api/bootstrap');
    assert.equal(bootstrap.data.bikes.length, 1);
    assert.equal(bootstrap.data.bikes[0].id, 'bike-import-1');
  } finally {
    await ctx.close();
  }
});

test('Static-File-Serving liefert Frontend per GET und HEAD aus', async () => {
  const tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-archiv-dist-'));
  fs.writeFileSync(
    path.join(tmpDist, 'index.html'),
    '<!doctype html><html><body>Bike Archiv</body></html>',
    'utf8',
  );

  const db = createDatabase(':memory:');
  seedInitialData(db);
  const server = createAppServer({ db, distDir: tmpDist, serveStatic: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const getRes = await fetch(`${baseUrl}/`);
    assert.equal(getRes.status, 200);
    assert.match(getRes.headers.get('content-type') || '', /text\/html/);
    const html = await getRes.text();
    assert.match(html, /Bike Archiv/);

    const headRes = await fetch(`${baseUrl}/`, { method: 'HEAD' });
    assert.equal(headRes.status, 200);
    assert.match(headRes.headers.get('content-type') || '', /text\/html/);
    const headBody = await headRes.text();
    assert.equal(headBody, '');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(tmpDist, { recursive: true, force: true });
  }
});

test('Upgrade-Migration v1.0.0 -> v1.1.0 behält eigene Daten/Seriennummern und ergänzt 60 Status-160-Teile', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-archiv-upgrade-'));
  const dbFile = path.join(tmpDir, 'legacy.sqlite');

  try {
    // Alte v1.0.0 Datenbank anlegen
    const legacy = new DatabaseSync(dbFile);
    legacy.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE bikes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        model_year INTEGER,
        category TEXT NOT NULL,
        frame_size TEXT NOT NULL DEFAULT '',
        wheel_size TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '',
        serial_number TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE bike_serials (
        id TEXT PRIMARY KEY,
        bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        serial_number TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE parts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        specs TEXT NOT NULL DEFAULT '',
        serial_number TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        bike_id TEXT REFERENCES bikes(id) ON DELETE SET NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE order_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'Sonstiges',
        bike_id TEXT,
        part_id TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        priority TEXT NOT NULL DEFAULT 'normal',
        estimated_price REAL,
        shop_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const now = '2026-11-26T10:00:00.000Z';
    legacy.prepare("INSERT INTO meta (key, value) VALUES ('initial_seed_applied', '1')").run();
    legacy
      .prepare(
        `INSERT INTO bikes (id, name, brand, model, model_year, category, frame_size, wheel_size, color, serial_number, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        SPECIALIZED_STATUS_160_ID,
        'Specialized Status 160',
        'Specialized',
        'Status 160',
        2022,
        'Enduro / Trail',
        'S3',
        '29" / 27.5" Mullet',
        'Satin Cast Umber / Clay',
        'WSBC-USER-CUSTOM-99',
        'Eigene Notiz bleibt erhalten',
        now,
        now,
      );
    legacy
      .prepare(
        `INSERT INTO bikes (id, name, brand, model, model_year, category, serial_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('bike-user-2', 'Trek Slash', 'Trek', 'Slash 8', 2023, 'Enduro', 'TREK-555', now, now);
    legacy
      .prepare(
        `INSERT INTO parts (id, name, brand, category, specs, serial_number, status, bike_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'legacy-fork-1',
        'FOX FLOAT 36 Rhythm',
        'FOX',
        'Fahrwerk',
        '160 mm',
        'FOX-SN-777',
        'in_use',
        SPECIALIZED_STATUS_160_ID,
        'Gabelservice erledigt',
        now,
        now,
      );
    legacy.close();

    // Mit neuer Version öffnen & migrieren
    const db = createDatabase(dbFile);
    seedInitialData(db);
    const updateRes = applyCatalogUpdates(db);
    assert.equal(updateRes.applied, true);
    assert.equal(updateRes.partsUpdated, 1);
    assert.equal(updateRes.partsAdded, 59);

    const statusBike = db.getBike(SPECIALIZED_STATUS_160_ID);
    assert.equal(statusBike.serialNumber, 'WSBC-USER-CUSTOM-99');
    assert.equal(statusBike.notes, 'Eigene Notiz bleibt erhalten');
    assert.equal(statusBike.imageUrl, '/images/bikes/specialized-status-160.svg');
    assert.equal(statusBike.partCount, 60);

    const migratedFork = statusBike.parts.find((p) => p.id === 'legacy-fork-1');
    assert.ok(migratedFork);
    assert.equal(migratedFork.serialNumber, 'FOX-SN-777');
    assert.equal(migratedFork.notes, 'Gabelservice erledigt');
    assert.equal(migratedFork.imageUrl, '/images/parts/fork-fox-36-rhythm.svg');
    assert.ok(migratedFork.structuredSpecs.length >= 6);

    const customBike = db.getBike('bike-user-2');
    assert.ok(customBike);
    assert.equal(customBike.serialNumber, 'TREK-555');

    // Zweiter Aufruf ist idempotent
    const secondRun = applyCatalogUpdates(db);
    assert.equal(secondRun.applied, false);
    assert.equal(db.getBike(SPECIALIZED_STATUS_160_ID).partCount, 60);
    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Bild-Upload validiert Format/Magic-Bytes, benötigt CSRF und liefert unter /uploads/ aus', async () => {
  const tmpUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-archiv-uploads-'));
  const ctx = await startTestServer({ uploadsDir: tmpUploads });
  try {
    // 1x1 PNG
    const validPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const noCsrf = await apiFetch(ctx.baseUrl, '/api/uploads', {
      method: 'POST',
      includeCsrf: false,
      body: { mimeType: 'image/png', dataBase64: validPngBase64 },
    });
    assert.equal(noCsrf.res.status, 403);

    const badMime = await apiFetch(ctx.baseUrl, '/api/uploads', {
      method: 'POST',
      body: {
        mimeType: 'image/svg+xml',
        dataBase64: Buffer.from('<svg></svg>').toString('base64'),
      },
    });
    assert.equal(badMime.res.status, 400);

    const badMagic = await apiFetch(ctx.baseUrl, '/api/uploads', {
      method: 'POST',
      body: {
        mimeType: 'image/png',
        dataBase64: Buffer.from('not-a-png').toString('base64'),
      },
    });
    assert.equal(badMagic.res.status, 400);

    const okUpload = await apiFetch(ctx.baseUrl, '/api/uploads', {
      method: 'POST',
      body: { mimeType: 'image/png', dataBase64: validPngBase64 },
    });
    assert.equal(okUpload.res.status, 201);
    assert.match(okUpload.data.imageUrl, /^\/uploads\/[a-f0-9-]{36}\.png$/);

    const fetchImg = await fetch(`${ctx.baseUrl}${okUpload.data.imageUrl}`);
    assert.equal(fetchImg.status, 200);
    assert.equal(fetchImg.headers.get('content-type'), 'image/png');
  } finally {
    await ctx.close();
    fs.rmSync(tmpUploads, { recursive: true, force: true });
  }
});

test('System-Status und inkrementelles Update-Paket über /api/system/*', async () => {
  const ctx = await startTestServer();
  try {
    const statusRes = await apiFetch(ctx.baseUrl, '/api/system/status');
    assert.equal(statusRes.res.status, 200);
    assert.equal(statusRes.data.schemaVersion, '2');
    assert.equal(statusRes.data.catalogVersion, '1.1.0');
    assert.ok(Array.isArray(statusRes.data.updateHistory));

    const pkgRes = await apiFetch(ctx.baseUrl, '/api/system/apply-update', {
      method: 'POST',
      body: {
        mode: 'package',
        package: {
          updateId: 'patch-2026-11-28-pedals',
          version: '1.1.1',
          description: 'Ergänzt Pedale als Ersatzteil im Lager',
          parts: [
            {
              id: 'part-update-pedal-1',
              catalogKey: 'custom-pedals-1',
              name: 'OneUp Aluminium Pedale',
              brand: 'OneUp',
              category: 'Antrieb',
              subCategory: 'Pedale',
              partNumber: '1C0552BLK',
              quantity: 2,
              specs: 'Plattformpedale mit 10 Pins pro Seite',
              structuredSpecs: [
                { label: 'Plattform', value: '115 × 105 mm Aluminium' },
                { label: 'Pins', value: '10 pro Seite' },
              ],
              manufacturerUrl: 'https://www.oneupcomponents.com',
              imageUrl: '/images/parts/drivetrain-crankset.svg',
              status: 'in_stock',
            },
          ],
        },
      },
    });
    assert.equal(pkgRes.res.status, 200);
    assert.equal(pkgRes.data.result.partsAdded, 1);
    assert.equal(pkgRes.data.parts.length, 61);
    assert.ok(
      pkgRes.data.systemStatus.updateHistory.some(
        (h) => h.id === 'patch-2026-11-28-pedals',
      ),
    );
  } finally {
    await ctx.close();
  }
});
