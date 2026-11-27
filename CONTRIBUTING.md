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
```

## Projektstruktur

- `src/` — React-19-Frontend (TypeScript, Vite) inkl. `src/localStore.ts` für den serverlosen Browser-Betrieb
- `server/` — Node.js-HTTP-Server und SQLite-Persistenz (`node:sqlite`)
- `tests/` — Automatisierte API- und LocalStore-Tests (`node --test`)
- `.github/` — CI-Workflow (`workflows/ci.yml`), Vorlagen und Agenten-Leitfaden (`copilot-instructions.md`)

## Dual-Mode-Konsistenz

Bike Archiv läuft sowohl statisch im Browser (`localStorage`) als auch mit dem optionalen Node.js-Server (`SQLite`). Änderungen an Datenmodellen, Validierungen oder dem initialen Seed (`Specialized Status 160` mit 21 Teilen) müssen immer in beiden Schichten (`server/` und `src/`) konsistent umgesetzt und durch Tests abgedeckt werden.

## Branches & Commits

- Größere Änderungen auf einem eigenen Branch vorbereiten und per Pull Request gegen `main` zusammenführen.
- Commit-Nachrichten im Conventional-Commits-Format verfassen (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`).
- Vor jedem Push sicherstellen, dass `npm run build` und `npm test` ohne Fehler durchlaufen.
