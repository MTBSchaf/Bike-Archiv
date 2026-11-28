# Mitwirken an Bike Archiv

Diese Anleitung richtet sich an Entwicklerinnen, Entwickler und KI-Agenten.

## Voraussetzungen

- **Node.js:** `>= 22.5.0` (erforderlich für das integrierte `node:sqlite`-Modul)
- **npm:** passend zur Node.js-Installation

## Lokales Setup

```bash
npm ci
npm run dev
```

Für Build und Tests:

```bash
npm run build
npm test
npm run check:repo
```

## Projektstruktur

- `src/` — React-19-Frontend (TypeScript, Vite) mit direkter API-Anbindung an `/api/*`
- `server/` — Node.js-HTTP-Server und SQLite-Persistenz (`node:sqlite`)
- `deploy/proxmox/` — LXC-Installer (`install.sh`), Container-Updater (`update.sh`) und Host-Updater (`proxmox-update.sh`)
- `docs/` — Betriebsdokumentation (z. B. `PROXMOX-UPDATE.md`)
- `scripts/` — Repository-Hygiene-Prüfung (`check-repo-hygiene.mjs`)
- `tests/` — Automatisierte API-, Proxmox- und Hygiene-Tests (`node --test`)
- `.github/` — CI-Workflow (`workflows/ci.yml`), Vorlagen und Agenten-Leitfaden (`copilot-instructions.md`)

## Repository-Hygiene

Im Repository darf ausschließlich das Server-Programm inklusive des ersten Beispiels (`Specialized Status 160` in `server/seed.mjs`) gespeichert werden. Vor jedem Push sicherstellen, dass `npm run check:repo` ohne Verstöße durchläuft.

## Konsistenz zwischen Server und Frontend

Änderungen an Datenmodellen, Validierungen (`server/validation.mjs` und `src/validation.ts`) oder API-Endpunkten (`server/app.mjs` und `src/api.ts`) müssen über alle betroffenen Schichten hinweg konsistent umgesetzt und durch Tests abgedeckt werden.

## Branches & Commits

- Größere Änderungen auf einem eigenen Branch vorbereiten und per Pull Request gegen `main` zusammenführen.
- Commit-Nachrichten im Conventional-Commits-Format verfassen (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`).
- Vor jedem Push sicherstellen, dass `npm run build` und `npm test` ohne Fehler durchlaufen.
