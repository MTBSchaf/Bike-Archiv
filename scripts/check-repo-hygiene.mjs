import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../server/db.mjs';
import {
  seedInitialData,
  SPECIALIZED_STATUS_160_BIKE,
  SPECIALIZED_STATUS_160_ID,
  SPECIALIZED_STATUS_160_PARTS,
} from '../server/seed.mjs';

const ALLOWED_TOP_DIRS = new Set([
  '.github',
  'deploy',
  'docs',
  'public',
  'scripts',
  'server',
  'src',
  'tests',
]);

const ALLOWED_ROOT_FILES = new Set([
  '.editorconfig',
  '.gitignore',
  'CONTRIBUTING.md',
  'README.md',
  'SECURITY.md',
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
]);

const ALLOWED_JSON_FILES = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
]);

const FORBIDDEN_PATH_SUBSTRINGS = [
  '.env',
  '.board',
  '.git-askpass',
  'AGENTS.md',
];

const FORBIDDEN_PATH_SEGMENTS = new Set([
  'data',
  'uploads',
  'backups',
  'exports',
  'dist',
  'node_modules',
]);

const FORBIDDEN_EXTENSIONS = [
  '.sqlite',
  '.sqlite3',
  '.sqlite-wal',
  '.sqlite-shm',
  '.db',
  '.db-wal',
  '.db-shm',
  '.zip',
  '.tar.gz',
  '.tgz',
  '.bak',
  '.sql',
  '.dump',
  '.csv',
];

const ALLOWED_STATIC_IMAGE_FILES = new Set([
  'public/images/logo-mtbschaf.png',
  'public/images/favicon-mtbschaf.png',
  'public/images/bikes/specialized-status-160.svg',
]);

const PART_SVG_IMAGE_RE = /^public\/images\/parts\/[a-z0-9-]+\.svg$/;

/**
 * Prüft eine Liste getrackter Repository-Pfade auf unerlaubte Nutzer-, Laufzeit- oder Archivdateien.
 * @param {string[]} files
 * @returns {string[]} Liste gefundener Verstöße
 */
export function validateTrackedFiles(files) {
  const violations = [];

  for (const rawFile of files) {
    const file = String(rawFile || '').replace(/\\/g, '/').trim();
    if (!file) continue;

    const lower = file.toLowerCase();
    const segments = file.split('/');
    const topLevel = segments[0];

    if (segments.length === 1) {
      if (!ALLOWED_ROOT_FILES.has(file)) {
        violations.push(`Unerlaubte Datei im Root-Verzeichnis: ${file}`);
      }
    } else if (!ALLOWED_TOP_DIRS.has(topLevel)) {
      violations.push(`Unerlaubtes Top-Level-Verzeichnis: ${file}`);
    }

    if (segments.some((seg) => FORBIDDEN_PATH_SEGMENTS.has(seg.toLowerCase()))) {
      violations.push(`Laufzeit- oder Datenverzeichnis im Repo nicht erlaubt: ${file}`);
    }

    if (FORBIDDEN_PATH_SUBSTRINGS.some((sub) => file.includes(sub))) {
      violations.push(`Verbotener Dateiname oder internes Artefakt im Repo: ${file}`);
    }

    if (FORBIDDEN_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      violations.push(`Datenbank-, Backup- oder Archivdatei im Repo nicht erlaubt: ${file}`);
    }

    if (lower.endsWith('.json') && !ALLOWED_JSON_FILES.has(file)) {
      violations.push(`JSON-Datendatei im Repo nicht erlaubt (nur Konfigurations-JSON erlaubt): ${file}`);
    }

    if (file.startsWith('public/images/')) {
      if (!ALLOWED_STATIC_IMAGE_FILES.has(file) && !PART_SVG_IMAGE_RE.test(file)) {
        violations.push(`Unerlaubtes Bild unter public/images/ (nur Logo/Favicon/Status-160-Beispiel erlaubt): ${file}`);
      }
    }
  }

  return violations;
}

/**
 * Prüft, dass der initiale Seed ausschließlich das erste Beispiel (Specialized Status 160) ohne Nutzerdaten enthält.
 * @returns {string[]} Liste gefundener Verstöße
 */
export function validateSeedExampleOnly() {
  const violations = [];

  if (SPECIALIZED_STATUS_160_ID !== 'bike-specialized-status-160') {
    violations.push(`Unerwartete Initial-Bike-ID: ${SPECIALIZED_STATUS_160_ID}`);
  }

  if (SPECIALIZED_STATUS_160_BIKE.serialNumber !== '') {
    violations.push('Initiales Beispiel-Bike darf keine persönliche Seriennummer enthalten.');
  }

  for (const part of SPECIALIZED_STATUS_160_PARTS) {
    if (part.serialNumber && String(part.serialNumber).trim() !== '') {
      violations.push(`Initiales Beispielteil ${part.catalogKey} enthält eine Seriennummer.`);
    }
    if (typeof part.imageUrl === 'string' && part.imageUrl.startsWith('/uploads/')) {
      violations.push(`Initiales Beispielteil ${part.catalogKey} verweist auf /uploads/.`);
    }
  }

  const db = createDatabase(':memory:');
  try {
    seedInitialData(db);
    const bikes = db.listBikes();
    const parts = db.listParts();
    const orders = db.listOrderItems();

    if (bikes.length !== 1 || bikes[0].id !== SPECIALIZED_STATUS_160_ID) {
      violations.push(`Initial-Seed muss genau 1 Beispiel-Bike (${SPECIALIZED_STATUS_160_ID}) anlegen, gefunden: ${bikes.length}.`);
    }
    if (orders.length !== 0) {
      violations.push(`Initial-Seed darf keine Bestellungen anlegen, gefunden: ${orders.length}.`);
    }
    const foreignParts = parts.filter((p) => p.bikeId !== SPECIALIZED_STATUS_160_ID);
    if (foreignParts.length > 0) {
      violations.push(`Initial-Seed enthält ${foreignParts.length} Teile außerhalb des ersten Beispiels.`);
    }
  } finally {
    db.close();
  }

  return violations;
}

/**
 * Führt die komplette Repository-Hygiene-Prüfung für ein Git-Arbeitsverzeichnis durch.
 * @param {string} repoRoot
 */
export function runRepoHygieneCheck(repoRoot) {
  const output = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], {
    encoding: 'utf8',
  });
  const trackedFiles = output.split('\0').filter(Boolean);
  const fileViolations = validateTrackedFiles(trackedFiles);
  const seedViolations = validateSeedExampleOnly();
  const violations = [...fileViolations, ...seedViolations];

  return {
    ok: violations.length === 0,
    trackedCount: trackedFiles.length,
    violations,
  };
}

function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..');

  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    console.error('[FEHLER] Kein Git-Repository gefunden.');
    process.exit(1);
  }

  const result = runRepoHygieneCheck(repoRoot);
  if (!result.ok) {
    console.error('[FEHLER] Repository-Hygiene-Prüfung fehlgeschlagen:');
    for (const v of result.violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }

  console.log(
    `[OK] Repository-Hygiene geprüft (${result.trackedCount} getrackte Dateien: ausschließlich Server-Programm und Specialized-Status-160-Beispiel).`,
  );
}

const isCliEntry =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntry) {
  main();
}
