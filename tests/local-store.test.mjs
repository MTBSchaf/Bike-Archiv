import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../src/localStore.ts';
import { SPECIALIZED_STATUS_160_ID } from '../src/initialSeed.ts';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

test('LocalStore: Initialer Seed mit Specialized Status 160 und 21 Teilen + kein Re-Seed nach Löschen', () => {
  const storage = createMemoryStorage();
  const store = createLocalStore(storage);

  const initial = store.getBootstrap();
  assert.equal(initial.bikes.length, 1);
  assert.equal(initial.bikes[0].id, SPECIALIZED_STATUS_160_ID);
  assert.equal(initial.bikes[0].partCount, 21);
  assert.equal(initial.parts.length, 21);

  for (const part of initial.parts) {
    assert.equal(part.status, 'in_use');
    assert.equal(part.bikeId, SPECIALIZED_STATUS_160_ID);
    assert.equal(part.bikeName, 'Specialized Status 160');
  }

  // Bike löschen -> Teile gehen ins Lager, aber es wird nicht erneut geseedet
  store.deleteBike(SPECIALIZED_STATUS_160_ID);
  const storeReloaded = createLocalStore(storage);
  const afterDelete = storeReloaded.getBootstrap();
  assert.equal(afterDelete.bikes.length, 0);
  assert.equal(afterDelete.parts.length, 21);
  assert.ok(afterDelete.parts.every((p) => p.status === 'in_stock' && p.bikeId === null));
});

test('LocalStore: Bikes, Seriennummern, Teile-Invarianten & Bestellübernahme ins Lager', () => {
  const store = createLocalStore(createMemoryStorage());

  const { bike } = store.createBike({
    name: '',
    brand: 'Canyon',
    model: 'Spectral CF 8',
    modelYear: 2024,
    category: 'Trail',
    frameSize: 'L',
    wheelSize: '29"',
    color: 'Schwarz',
    serialNumber: 'M07801',
    notes: '',
    serials: [{ label: 'Gabel', serialNumber: 'FOX-36-111', notes: '' }],
  });
  assert.equal(bike.name, 'Canyon Spectral CF 8');
  assert.equal(bike.serials.length, 1);

  const { serial } = store.addBikeSerial(bike.id, {
    label: 'Dämpfer',
    serialNumber: 'FOX-DPX-222',
    notes: 'Service 2026',
  });
  assert.equal(store.getBike(bike.id).bike.serials.length, 2);

  store.deleteBikeSerial(bike.id, serial.id);
  assert.equal(store.getBike(bike.id).bike.serials.length, 1);

  assert.throws(
    () =>
      store.createPart({
        name: 'Vorbau',
        brand: 'Burgtec',
        category: 'Cockpit & Sattel',
        specs: '40 mm',
        serialNumber: '',
        status: 'in_use',
        bikeId: null,
        notes: '',
      }),
    /Fahrrad ausgewählt werden/,
  );

  const { part } = store.createPart({
    name: 'Burgtec Vorbau',
    brand: 'Burgtec',
    category: 'Cockpit & Sattel',
    specs: '40 mm',
    serialNumber: '',
    status: 'in_use',
    bikeId: bike.id,
    notes: '',
  });
  assert.equal(part.bikeName, 'Canyon Spectral CF 8');

  const { part: updatedPart } = store.updatePart(part.id, {
    name: part.name,
    brand: part.brand,
    category: part.category,
    specs: part.specs,
    serialNumber: part.serialNumber,
    status: 'defective',
    bikeId: bike.id,
    notes: part.notes,
  });
  assert.equal(updatedPart.status, 'defective');
  assert.equal(updatedPart.bikeId, null);

  const { orderItem } = store.createOrderItem({
    name: 'SRAM Bremsbeläge',
    brand: 'SRAM',
    category: 'Bremsen',
    bikeId: bike.id,
    partId: null,
    quantity: 2,
    priority: 'high',
    estimatedPrice: 24.5,
    shopUrl: 'https://www.bike-components.de/',
    status: 'open',
    notes: 'Sinter',
  });

  const received = store.receiveOrderItemToStock(orderItem.id);
  assert.equal(received.orderItem.status, 'received');
  assert.equal(received.part.status, 'in_stock');
  assert.equal(received.part.specs, 'Bestellte Menge: 2');
});

test('LocalStore: Backup-Import ersetzt Bestand und lehnt ungültige Eingaben ab', () => {
  const store = createLocalStore(createMemoryStorage());

  assert.throws(
    () =>
      store.importBackup({
        bikes: [],
        parts: [],
        orderItems: [
          {
            id: 'o1',
            name: 'Test',
            category: 'Bremsen',
            quantity: 1,
            priority: 'normal',
            status: 'open',
            shopUrl: 'javascript:alert(1)',
          },
        ],
      }),
    /http:\/\/ oder https:\/\//,
  );

  assert.throws(
    () =>
      store.importBackup({
        bikes: [],
        parts: [
          {
            id: 'p1',
            name: 'Lenker',
            category: 'Cockpit & Sattel',
            status: 'in_use',
            bikeId: 'missing-bike',
          },
        ],
        orderItems: [],
      }),
    /unbekanntes Fahrrad/,
  );

  const imported = store.importBackup({
    bikes: [
      {
        id: 'b1',
        brand: 'Propain',
        model: 'Tyee 6',
        category: 'Enduro',
        serials: [],
      },
    ],
    parts: [
      {
        id: 'p1',
        name: 'RockShox ZEB',
        category: 'Fahrwerk',
        status: 'in_use',
        bikeId: 'b1',
      },
    ],
    orderItems: [],
  });

  assert.equal(imported.bikes.length, 1);
  assert.equal(imported.bikes[0].name, 'Propain Tyee 6');
  assert.equal(imported.bikes[0].partCount, 1);
  assert.equal(imported.parts[0].bikeName, 'Propain Tyee 6');
});
