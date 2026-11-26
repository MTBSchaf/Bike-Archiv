import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './app.mjs';
import { createDatabase } from './db.mjs';
import { seedInitialData } from './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const dbPath = process.env.DB_PATH || path.join(rootDir, 'data', 'bike-archiv.sqlite');
const distDir = path.join(rootDir, 'dist');
const serveStatic = process.env.NODE_ENV === 'production';

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
