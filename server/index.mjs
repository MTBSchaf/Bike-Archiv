import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './app.mjs';
import { createDatabase } from './db.mjs';
import { seedInitialData } from './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Ungültiger PORT-Wert. Erwartet wird eine Ganzzahl zwischen 1 und 65535.');
  process.exit(1);
}
const host = process.env.HOST || '127.0.0.1';
const dbPath = process.env.DB_PATH || path.join(rootDir, 'data', 'bike-archiv.sqlite');
const distDir = path.join(rootDir, 'dist');
const distIndexPath = path.join(distDir, 'index.html');
const serveStatic =
  process.env.SERVE_STATIC === 'false'
    ? false
    : process.env.NODE_ENV === 'development'
      ? false
      : fs.existsSync(distIndexPath);

const db = createDatabase(dbPath);
seedInitialData(db);

const server = createAppServer({ db, distDir, serveStatic });

server.listen(port, host, () => {
  console.log(`Bike Archiv Server läuft auf http://${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
