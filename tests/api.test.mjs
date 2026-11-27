import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../server/db.mjs';
import { seedInitialData, SPECIALIZED_STATUS_160_ID } from '../server/seed.mjs';
import { createAppServer } from '../server/app.mjs';

async function startTestServer() {
  const db = createDatabase(':memory:');
  seedInitialData(db);
  const server = createAppServer({ db, serveStatic: false });
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

test('Initialer Seed enthält Specialized Status 160 mit allen 21 verbauten Teilen', async () => {
  const ctx = await startTestServer();
  try {
    const { res, data } = await apiFetch(ctx.baseUrl, '/api/bootstrap');
    assert.equal(res.status, 200);
    assert.equal(data.bikes.length, 1);
    const bike = data.bikes[0];
    assert.equal(bike.id, SPECIALIZED_STATUS_160_ID);
    assert.equal(bike.name, 'Specialized Status 160');
    assert.equal(bike.partCount, 21);
    assert.equal(data.parts.length, 21);

    for (const part of data.parts) {
      assert.equal(part.status, 'in_use');
      assert.equal(part.bikeId, SPECIALIZED_STATUS_160_ID);
      assert.equal(part.bikeName, 'Specialized Status 160');
    }

    // Idempotenz prüfen
    seedInitialData(ctx.db);
    assert.equal(ctx.db.listBikes().length, 1);
    assert.equal(ctx.db.listParts().length, 21);
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
