import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runRepoHygieneCheck,
  validateSeedExampleOnly,
  validateTrackedFiles,
} from '../scripts/check-repo-hygiene.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('Repository enthält ausschließlich das Server-Programm und das erste Specialized-Status-160-Beispiel', () => {
  const result = runRepoHygieneCheck(repoRoot);
  assert.equal(result.ok, true, `Hygiene-Verstöße gefunden:\n${result.violations.join('\n')}`);
  assert.ok(result.trackedCount > 0);
});

test('validateSeedExampleOnly bestätigt, dass nur Specialized Status 160 ohne Nutzerdaten geseedet wird', () => {
  const violations = validateSeedExampleOnly();
  assert.deepEqual(violations, []);
});

test('validateTrackedFiles blockiert Datenbanken, Uploads, Backups, Archive und fremde Daten zuverlässig', () => {
  const forbiddenExamples = [
    'data/bike-archiv.sqlite',
    'bike-archiv.sqlite-wal',
    'uploads/photo.jpg',
    'public/uploads/x.png',
    'backups/backup.json',
    'bike-archiv-website.zip',
    'public/images/bikes/my-second-bike.jpg',
    '.env',
    'my-export.json',
    'AGENTS.md',
  ];

  for (const file of forbiddenExamples) {
    const violations = validateTrackedFiles([file]);
    assert.ok(
      violations.length > 0,
      `Erwarteter Hygiene-Verstoß für '${file}' wurde nicht gemeldet.`,
    );
  }

  const allowedExamples = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'server/index.mjs',
    'src/App.tsx',
    'deploy/proxmox/update.sh',
    'deploy/proxmox/proxmox-update.sh',
    'docs/PROXMOX-UPDATE.md',
    'public/images/logo-mtbschaf.png',
    'public/images/bikes/specialized-status-160.svg',
    'public/images/parts/fork-fox-36-rhythm.svg',
  ];

  assert.deepEqual(validateTrackedFiles(allowedExamples), []);
});
