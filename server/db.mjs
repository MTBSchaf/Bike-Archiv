import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function mapSerialRow(row) {
  return {
    id: row.id,
    bikeId: row.bike_id,
    label: row.label,
    serialNumber: row.serial_number,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapPartRow(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    specs: row.specs,
    serialNumber: row.serial_number,
    status: row.status,
    bikeId: row.bike_id ?? null,
    bikeName: row.bike_name ?? null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBikeRow(row, serials = []) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    model: row.model,
    modelYear: row.model_year ?? null,
    category: row.category,
    frameSize: row.frame_size,
    wheelSize: row.wheel_size,
    color: row.color,
    serialNumber: row.serial_number,
    notes: row.notes,
    partCount: Number(row.part_count ?? 0),
    serials,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderRow(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    bikeId: row.bike_id ?? null,
    bikeName: row.bike_name ?? null,
    partId: row.part_id ?? null,
    quantity: Number(row.quantity),
    priority: row.priority,
    estimatedPrice: row.estimated_price ?? null,
    shopUrl: row.shop_url,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bikes (
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

    CREATE TABLE IF NOT EXISTS bike_serials (
      id TEXT PRIMARY KEY,
      bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      serial_number TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      specs TEXT NOT NULL DEFAULT '',
      serial_number TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('in_use', 'in_stock', 'defective')),
      bike_id TEXT REFERENCES bikes(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK ((status = 'in_use' AND bike_id IS NOT NULL) OR (status != 'in_use' AND bike_id IS NULL))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Sonstiges',
      bike_id TEXT REFERENCES bikes(id) ON DELETE SET NULL,
      part_id TEXT REFERENCES parts(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 999),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
      estimated_price REAL,
      shop_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ordered', 'received')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bike_serials_bike_id ON bike_serials(bike_id);
    CREATE INDEX IF NOT EXISTS idx_parts_bike_id ON parts(bike_id);
    CREATE INDEX IF NOT EXISTS idx_parts_status ON parts(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);
  `);

  const stmtGetMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
  const stmtSetMeta = db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );

  const stmtListBikes = db.prepare(`
    SELECT
      b.*,
      (SELECT COUNT(*) FROM parts p WHERE p.bike_id = b.id AND p.status = 'in_use') AS part_count
    FROM bikes b
    ORDER BY b.created_at ASC, b.name ASC
  `);

  const stmtGetBike = db.prepare(`
    SELECT
      b.*,
      (SELECT COUNT(*) FROM parts p WHERE p.bike_id = b.id AND p.status = 'in_use') AS part_count
    FROM bikes b
    WHERE b.id = ?
  `);

  const stmtBikeExists = db.prepare('SELECT id FROM bikes WHERE id = ?');
  const stmtPartExists = db.prepare('SELECT id FROM parts WHERE id = ?');

  const stmtListAllSerials = db.prepare(
    'SELECT * FROM bike_serials ORDER BY created_at ASC, label ASC',
  );
  const stmtListSerialsForBike = db.prepare(
    'SELECT * FROM bike_serials WHERE bike_id = ? ORDER BY created_at ASC, label ASC',
  );
  const stmtGetSerial = db.prepare('SELECT * FROM bike_serials WHERE id = ? AND bike_id = ?');

  const stmtInsertBike = db.prepare(`
    INSERT INTO bikes (
      id, name, brand, model, model_year, category, frame_size, wheel_size,
      color, serial_number, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtUpdateBike = db.prepare(`
    UPDATE bikes SET
      name = ?, brand = ?, model = ?, model_year = ?, category = ?,
      frame_size = ?, wheel_size = ?, color = ?, serial_number = ?,
      notes = ?, updated_at = ?
    WHERE id = ?
  `);

  const stmtDeleteBike = db.prepare('DELETE FROM bikes WHERE id = ?');

  const stmtInsertSerial = db.prepare(`
    INSERT INTO bike_serials (id, bike_id, label, serial_number, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const stmtDeleteSerial = db.prepare('DELETE FROM bike_serials WHERE id = ? AND bike_id = ?');

  const stmtListParts = db.prepare(`
    SELECT p.*, b.name AS bike_name
    FROM parts p
    LEFT JOIN bikes b ON b.id = p.bike_id
    ORDER BY
      CASE p.status WHEN 'in_use' THEN 0 WHEN 'in_stock' THEN 1 ELSE 2 END,
      p.category ASC,
      p.name ASC
  `);

  const stmtListPartsForBike = db.prepare(`
    SELECT p.*, b.name AS bike_name
    FROM parts p
    LEFT JOIN bikes b ON b.id = p.bike_id
    WHERE p.bike_id = ? AND p.status = 'in_use'
    ORDER BY p.category ASC, p.name ASC
  `);

  const stmtGetPart = db.prepare(`
    SELECT p.*, b.name AS bike_name
    FROM parts p
    LEFT JOIN bikes b ON b.id = p.bike_id
    WHERE p.id = ?
  `);

  const stmtInsertPart = db.prepare(`
    INSERT INTO parts (
      id, name, brand, category, specs, serial_number, status, bike_id, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtUpdatePart = db.prepare(`
    UPDATE parts SET
      name = ?, brand = ?, category = ?, specs = ?, serial_number = ?,
      status = ?, bike_id = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `);

  const stmtReleaseBikeParts = db.prepare(`
    UPDATE parts
    SET status = 'in_stock', bike_id = NULL, updated_at = ?
    WHERE bike_id = ?
  `);

  const stmtDeletePart = db.prepare('DELETE FROM parts WHERE id = ?');

  const stmtListOrders = db.prepare(`
    SELECT o.*, b.name AS bike_name
    FROM order_items o
    LEFT JOIN bikes b ON b.id = o.bike_id
    ORDER BY
      CASE o.status WHEN 'open' THEN 0 WHEN 'ordered' THEN 1 ELSE 2 END,
      CASE o.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
      o.created_at DESC
  `);

  const stmtGetOrder = db.prepare(`
    SELECT o.*, b.name AS bike_name
    FROM order_items o
    LEFT JOIN bikes b ON b.id = o.bike_id
    WHERE o.id = ?
  `);

  const stmtInsertOrder = db.prepare(`
    INSERT INTO order_items (
      id, name, brand, category, bike_id, part_id, quantity, priority,
      estimated_price, shop_url, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtUpdateOrder = db.prepare(`
    UPDATE order_items SET
      name = ?, brand = ?, category = ?, bike_id = ?, part_id = ?, quantity = ?,
      priority = ?, estimated_price = ?, shop_url = ?, status = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `);

  const stmtDeleteOrder = db.prepare('DELETE FROM order_items WHERE id = ?');

  let txDepth = 0;

  function runInTransaction(fn) {
    const depth = txDepth;
    txDepth += 1;
    if (depth === 0) {
      db.exec('BEGIN IMMEDIATE;');
    } else {
      db.exec(`SAVEPOINT sp_${depth};`);
    }
    try {
      const result = fn();
      if (depth === 0) {
        db.exec('COMMIT;');
      } else {
        db.exec(`RELEASE SAVEPOINT sp_${depth};`);
      }
      return result;
    } catch (err) {
      try {
        if (depth === 0) {
          db.exec('ROLLBACK;');
        } else {
          db.exec(`ROLLBACK TO SAVEPOINT sp_${depth};`);
          db.exec(`RELEASE SAVEPOINT sp_${depth};`);
        }
      } catch {
        // Ignore rollback errors after original failure
      }
      throw err;
    } finally {
      txDepth -= 1;
    }
  }

  return {
    raw: db,
    close() {
      db.close();
    },
    getMeta(key) {
      const row = stmtGetMeta.get(key);
      return row ? row.value : null;
    },
    setMeta(key, value) {
      stmtSetMeta.run(key, value);
    },
    runInTransaction,
    bikeExists(id) {
      return Boolean(stmtBikeExists.get(id));
    },
    partExists(id) {
      return Boolean(stmtPartExists.get(id));
    },
    listBikes() {
      const bikeRows = stmtListBikes.all();
      const serialRows = stmtListAllSerials.all();
      const serialsByBike = new Map();
      for (const s of serialRows) {
        const mapped = mapSerialRow(s);
        const list = serialsByBike.get(s.bike_id) ?? [];
        list.push(mapped);
        serialsByBike.set(s.bike_id, list);
      }
      return bikeRows.map((row) => mapBikeRow(row, serialsByBike.get(row.id) ?? []));
    },
    getBike(id) {
      const row = stmtGetBike.get(id);
      if (!row) return null;
      const serials = stmtListSerialsForBike.all(id).map(mapSerialRow);
      const parts = stmtListPartsForBike.all(id).map(mapPartRow);
      return {
        ...mapBikeRow(row, serials),
        parts,
      };
    },
    createBike(input, forcedId = null) {
      return runInTransaction(() => {
        const now = new Date().toISOString();
        const id = forcedId || randomUUID();
        stmtInsertBike.run(
          id,
          input.name,
          input.brand,
          input.model,
          input.modelYear,
          input.category,
          input.frameSize,
          input.wheelSize,
          input.color,
          input.serialNumber,
          input.notes,
          now,
          now,
        );
        if (Array.isArray(input.serials)) {
          for (const s of input.serials) {
            stmtInsertSerial.run(randomUUID(), id, s.label, s.serialNumber, s.notes, now);
          }
        }
        return this.getBike(id);
      });
    },
    updateBike(id, input) {
      if (!stmtBikeExists.get(id)) return null;
      const now = new Date().toISOString();
      stmtUpdateBike.run(
        input.name,
        input.brand,
        input.model,
        input.modelYear,
        input.category,
        input.frameSize,
        input.wheelSize,
        input.color,
        input.serialNumber,
        input.notes,
        now,
        id,
      );
      return this.getBike(id);
    },
    deleteBike(id) {
      return runInTransaction(() => {
        if (!stmtBikeExists.get(id)) return false;
        const now = new Date().toISOString();
        stmtReleaseBikeParts.run(now, id);
        const result = stmtDeleteBike.run(id);
        return result.changes > 0;
      });
    },
    addBikeSerial(bikeId, input) {
      if (!stmtBikeExists.get(bikeId)) return null;
      const id = randomUUID();
      const now = new Date().toISOString();
      stmtInsertSerial.run(id, bikeId, input.label, input.serialNumber, input.notes, now);
      return mapSerialRow(stmtGetSerial.get(id, bikeId));
    },
    deleteBikeSerial(bikeId, serialId) {
      const result = stmtDeleteSerial.run(serialId, bikeId);
      return result.changes > 0;
    },
    listParts() {
      return stmtListParts.all().map(mapPartRow);
    },
    getPart(id) {
      const row = stmtGetPart.get(id);
      return row ? mapPartRow(row) : null;
    },
    createPart(input, forcedId = null) {
      const now = new Date().toISOString();
      const id = forcedId || randomUUID();
      stmtInsertPart.run(
        id,
        input.name,
        input.brand,
        input.category,
        input.specs,
        input.serialNumber,
        input.status,
        input.bikeId,
        input.notes,
        now,
        now,
      );
      return this.getPart(id);
    },
    updatePart(id, input) {
      if (!stmtPartExists.get(id)) return null;
      const now = new Date().toISOString();
      stmtUpdatePart.run(
        input.name,
        input.brand,
        input.category,
        input.specs,
        input.serialNumber,
        input.status,
        input.bikeId,
        input.notes,
        now,
        id,
      );
      return this.getPart(id);
    },
    deletePart(id) {
      const result = stmtDeletePart.run(id);
      return result.changes > 0;
    },
    listOrderItems() {
      return stmtListOrders.all().map(mapOrderRow);
    },
    getOrderItem(id) {
      const row = stmtGetOrder.get(id);
      return row ? mapOrderRow(row) : null;
    },
    createOrderItem(input) {
      const now = new Date().toISOString();
      const id = randomUUID();
      stmtInsertOrder.run(
        id,
        input.name,
        input.brand,
        input.category,
        input.bikeId,
        input.partId,
        input.quantity,
        input.priority,
        input.estimatedPrice,
        input.shopUrl,
        input.status,
        input.notes,
        now,
        now,
      );
      return this.getOrderItem(id);
    },
    updateOrderItem(id, input) {
      const existing = stmtGetOrder.get(id);
      if (!existing) return null;
      const now = new Date().toISOString();
      stmtUpdateOrder.run(
        input.name,
        input.brand,
        input.category,
        input.bikeId,
        input.partId,
        input.quantity,
        input.priority,
        input.estimatedPrice,
        input.shopUrl,
        input.status,
        input.notes,
        now,
        id,
      );
      return this.getOrderItem(id);
    },
    deleteOrderItem(id) {
      const result = stmtDeleteOrder.run(id);
      return result.changes > 0;
    },
    receiveOrderItemToStock(orderId) {
      return runInTransaction(() => {
        const orderRow = stmtGetOrder.get(orderId);
        if (!orderRow) return null;

        const now = new Date().toISOString();
        const partId = randomUUID();
        const specs =
          orderRow.quantity > 1 ? `Bestellte Menge: ${orderRow.quantity}` : '';

        stmtInsertPart.run(
          partId,
          orderRow.name,
          orderRow.brand,
          orderRow.category,
          specs,
          '',
          'in_stock',
          null,
          orderRow.notes,
          now,
          now,
        );

        stmtUpdateOrder.run(
          orderRow.name,
          orderRow.brand,
          orderRow.category,
          orderRow.bike_id,
          partId,
          orderRow.quantity,
          orderRow.priority,
          orderRow.estimated_price,
          orderRow.shop_url,
          'received',
          orderRow.notes,
          now,
          orderId,
        );

        return {
          orderItem: this.getOrderItem(orderId),
          part: this.getPart(partId),
        };
      });
    },
    replaceAllData(backup) {
      return runInTransaction(() => {
        db.exec('DELETE FROM order_items; DELETE FROM parts; DELETE FROM bike_serials; DELETE FROM bikes;');

        for (const bike of backup.bikes) {
          stmtInsertBike.run(
            bike.id,
            bike.name,
            bike.brand,
            bike.model,
            bike.modelYear,
            bike.category,
            bike.frameSize,
            bike.wheelSize,
            bike.color,
            bike.serialNumber,
            bike.notes,
            bike.createdAt,
            bike.updatedAt,
          );
          for (const serial of bike.serials) {
            stmtInsertSerial.run(
              serial.id,
              bike.id,
              serial.label,
              serial.serialNumber,
              serial.notes,
              serial.createdAt,
            );
          }
        }

        for (const part of backup.parts) {
          stmtInsertPart.run(
            part.id,
            part.name,
            part.brand,
            part.category,
            part.specs,
            part.serialNumber,
            part.status,
            part.bikeId,
            part.notes,
            part.createdAt,
            part.updatedAt,
          );
        }

        for (const item of backup.orderItems) {
          stmtInsertOrder.run(
            item.id,
            item.name,
            item.brand,
            item.category,
            item.bikeId,
            item.partId,
            item.quantity,
            item.priority,
            item.estimatedPrice,
            item.shopUrl,
            item.status,
            item.notes,
            item.createdAt,
            item.updatedAt,
          );
        }

        stmtSetMeta.run('initial_seed_applied', '1');

        return {
          bikes: this.listBikes(),
          parts: this.listParts(),
          orderItems: this.listOrderItems(),
        };
      });
    },
  };
}
