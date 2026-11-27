import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  ValidationError,
  validateBackupPayload,
  validateBikeInput,
  validateBikeSerialInput,
  validateOrderItemInput,
  validatePartInput,
} from './validation.mjs';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_IMPORT_BODY_BYTES = 2 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  );
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settled = true;
        const err = new ValidationError('Anfrageinhalt ist zu groß.');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ValidationError('Ungültiges JSON-Format.'));
      }
    });

    req.on('error', () => {
      if (settled) return;
      settled = true;
      reject(new ValidationError('Fehler beim Lesen der Anfrage.'));
    });
  });
}

function safeDecodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function serveStaticFile(distDir, reqPath, method, res) {
  const resolvedDist = path.resolve(distDir);
  if (!fs.existsSync(resolvedDist)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Frontend-Build nicht gefunden.');
    return;
  }

  let relativePath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  try {
    relativePath = decodeURIComponent(relativePath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ungültiger Pfad.');
    return;
  }

  let candidate = path.resolve(resolvedDist, relativePath);
  if (candidate !== resolvedDist && !candidate.startsWith(resolvedDist + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Zugriff verweigert.');
    return;
  }

  if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
    candidate = path.join(resolvedDist, 'index.html');
  }

  if (!fs.existsSync(candidate)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden.');
    return;
  }

  const ext = path.extname(candidate).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl =
    ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable';

  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': cacheControl,
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(candidate).pipe(res);
}

export function createAppServer({ db, distDir = null, serveStatic = false }) {
  return http.createServer(async (req, res) => {
    setSecurityHeaders(res);

    try {
      const method = req.method || 'GET';
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;

      if (pathname.startsWith('/api/')) {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          if (req.headers['x-bike-archiv-request'] !== '1') {
            sendJson(res, 403, { error: 'Fehlender Sicherheits-Header.' });
            return;
          }
        }

        if (pathname === '/api/health' && method === 'GET') {
          sendJson(res, 200, { ok: true });
          return;
        }

        if (pathname === '/api/bootstrap' && method === 'GET') {
          sendJson(res, 200, {
            bikes: db.listBikes(),
            parts: db.listParts(),
            orderItems: db.listOrderItems(),
          });
          return;
        }

        if (pathname === '/api/import' && method === 'POST') {
          const body = await readJsonBody(req, MAX_IMPORT_BODY_BYTES);
          const validated = validateBackupPayload(body);
          const payload = db.replaceAllData(validated);
          sendJson(res, 200, payload);
          return;
        }

        if (pathname === '/api/bikes' && method === 'GET') {
          sendJson(res, 200, { bikes: db.listBikes() });
          return;
        }

        if (pathname === '/api/bikes' && method === 'POST') {
          const body = await readJsonBody(req);
          const input = validateBikeInput(body);
          const bike = db.createBike(input);
          sendJson(res, 201, { bike });
          return;
        }

        const bikeSerialMatch = pathname.match(/^\/api\/bikes\/([^/]+)\/serials$/);
        if (bikeSerialMatch && method === 'POST') {
          const bikeId = safeDecodeSegment(bikeSerialMatch[1]);
          if (!bikeId) {
            sendJson(res, 400, { error: 'Ungültige Fahrrad-ID.' });
            return;
          }
          const body = await readJsonBody(req);
          const input = validateBikeSerialInput(body);
          const serial = db.addBikeSerial(bikeId, input);
          if (!serial) {
            sendJson(res, 404, { error: 'Fahrrad nicht gefunden.' });
            return;
          }
          sendJson(res, 201, { serial });
          return;
        }

        const bikeSerialDeleteMatch = pathname.match(
          /^\/api\/bikes\/([^/]+)\/serials\/([^/]+)$/,
        );
        if (bikeSerialDeleteMatch && method === 'DELETE') {
          const bikeId = safeDecodeSegment(bikeSerialDeleteMatch[1]);
          const serialId = safeDecodeSegment(bikeSerialDeleteMatch[2]);
          if (!bikeId || !serialId) {
            sendJson(res, 400, { error: 'Ungültige ID.' });
            return;
          }
          const deleted = db.deleteBikeSerial(bikeId, serialId);
          if (!deleted) {
            sendJson(res, 404, { error: 'Seriennummer nicht gefunden.' });
            return;
          }
          sendJson(res, 200, { deleted: true });
          return;
        }

        const bikeMatch = pathname.match(/^\/api\/bikes\/([^/]+)$/);
        if (bikeMatch) {
          const bikeId = safeDecodeSegment(bikeMatch[1]);
          if (!bikeId) {
            sendJson(res, 400, { error: 'Ungültige Fahrrad-ID.' });
            return;
          }
          if (method === 'GET') {
            const bike = db.getBike(bikeId);
            if (!bike) {
              sendJson(res, 404, { error: 'Fahrrad nicht gefunden.' });
              return;
            }
            sendJson(res, 200, { bike });
            return;
          }
          if (method === 'PUT') {
            const body = await readJsonBody(req);
            const input = validateBikeInput(body);
            const bike = db.updateBike(bikeId, input);
            if (!bike) {
              sendJson(res, 404, { error: 'Fahrrad nicht gefunden.' });
              return;
            }
            sendJson(res, 200, { bike });
            return;
          }
          if (method === 'DELETE') {
            const deleted = db.deleteBike(bikeId);
            if (!deleted) {
              sendJson(res, 404, { error: 'Fahrrad nicht gefunden.' });
              return;
            }
            sendJson(res, 200, { deleted: true });
            return;
          }
        }

        if (pathname === '/api/parts' && method === 'GET') {
          sendJson(res, 200, { parts: db.listParts() });
          return;
        }

        if (pathname === '/api/parts' && method === 'POST') {
          const body = await readJsonBody(req);
          const input = validatePartInput(body);
          if (input.bikeId && !db.bikeExists(input.bikeId)) {
            sendJson(res, 400, { error: 'Das ausgewählte Fahrrad existiert nicht.' });
            return;
          }
          const part = db.createPart(input);
          sendJson(res, 201, { part });
          return;
        }

        const partMatch = pathname.match(/^\/api\/parts\/([^/]+)$/);
        if (partMatch) {
          const partId = safeDecodeSegment(partMatch[1]);
          if (!partId) {
            sendJson(res, 400, { error: 'Ungültige Teile-ID.' });
            return;
          }
          if (method === 'PUT') {
            const body = await readJsonBody(req);
            const input = validatePartInput(body);
            if (input.bikeId && !db.bikeExists(input.bikeId)) {
              sendJson(res, 400, { error: 'Das ausgewählte Fahrrad existiert nicht.' });
              return;
            }
            const part = db.updatePart(partId, input);
            if (!part) {
              sendJson(res, 404, { error: 'Teil nicht gefunden.' });
              return;
            }
            sendJson(res, 200, { part });
            return;
          }
          if (method === 'DELETE') {
            const deleted = db.deletePart(partId);
            if (!deleted) {
              sendJson(res, 404, { error: 'Teil nicht gefunden.' });
              return;
            }
            sendJson(res, 200, { deleted: true });
            return;
          }
        }

        if (pathname === '/api/orders' && method === 'GET') {
          sendJson(res, 200, { orderItems: db.listOrderItems() });
          return;
        }

        if (pathname === '/api/orders' && method === 'POST') {
          const body = await readJsonBody(req);
          const input = validateOrderItemInput(body);
          if (input.bikeId && !db.bikeExists(input.bikeId)) {
            sendJson(res, 400, { error: 'Das ausgewählte Fahrrad existiert nicht.' });
            return;
          }
          if (input.partId && !db.partExists(input.partId)) {
            input.partId = null;
          }
          const orderItem = db.createOrderItem(input);
          sendJson(res, 201, { orderItem });
          return;
        }

        const receiveMatch = pathname.match(/^\/api\/orders\/([^/]+)\/receive-to-stock$/);
        if (receiveMatch && method === 'POST') {
          const orderId = safeDecodeSegment(receiveMatch[1]);
          if (!orderId) {
            sendJson(res, 400, { error: 'Ungültige Bestell-ID.' });
            return;
          }
          const result = db.receiveOrderItemToStock(orderId);
          if (!result) {
            sendJson(res, 404, { error: 'Bestellposten nicht gefunden.' });
            return;
          }
          sendJson(res, 200, result);
          return;
        }

        const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
        if (orderMatch) {
          const orderId = safeDecodeSegment(orderMatch[1]);
          if (!orderId) {
            sendJson(res, 400, { error: 'Ungültige Bestell-ID.' });
            return;
          }
          if (method === 'PUT') {
            const body = await readJsonBody(req);
            const input = validateOrderItemInput(body);
            if (input.bikeId && !db.bikeExists(input.bikeId)) {
              sendJson(res, 400, { error: 'Das ausgewählte Fahrrad existiert nicht.' });
              return;
            }
            if (input.partId && !db.partExists(input.partId)) {
              input.partId = null;
            }
            const orderItem = db.updateOrderItem(orderId, input);
            if (!orderItem) {
              sendJson(res, 404, { error: 'Bestellposten nicht gefunden.' });
              return;
            }
            sendJson(res, 200, { orderItem });
            return;
          }
          if (method === 'DELETE') {
            const deleted = db.deleteOrderItem(orderId);
            if (!deleted) {
              sendJson(res, 404, { error: 'Bestellposten nicht gefunden.' });
              return;
            }
            sendJson(res, 200, { deleted: true });
            return;
          }
        }

        sendJson(res, 404, { error: 'API-Endpunkt nicht gefunden.' });
        return;
      }

      if (serveStatic && distDir && (method === 'GET' || method === 'HEAD')) {
        serveStaticFile(distDir, pathname, method, res);
        return;
      }

      sendJson(res, 404, { error: 'Nicht gefunden.' });
    } catch (err) {
      if (err instanceof ValidationError) {
        sendJson(res, err.statusCode || 400, { error: err.message });
        return;
      }
      sendJson(res, 500, { error: 'Interner Serverfehler' });
    }
  });
}
