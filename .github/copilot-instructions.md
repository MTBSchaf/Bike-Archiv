# Arbeitsanweisungen für KI-Agenten (Bike Archiv)

## Projektüberblick & Tech-Stack
- **Frontend (`src/`):** React 19, TypeScript, Vite (statischer Build in `dist/` mit `base: './'` und IIFE-Bundle für File-Manager-/Webspace-Nutzung).
- **Backend (`server/`):** Zero-dependency Node.js (>= 22.5.0) HTTP-Server mit `node:sqlite` (`server/index.mjs`, `server/app.mjs`, `server/db.mjs`, `server/seed.mjs`, `server/validation.mjs`).
- **Tests (`tests/`):** Node Test Runner (`node --test tests/api.test.mjs tests/local-store.test.mjs`).

## Dual-Mode-Architektur & Paritätspflicht
- `src/api.ts` erkennt beim Start über `/api/health` (außer bei `file:`-Protokoll) automatisch, ob der Node.js-Server erreichbar ist, und wechselt andernfalls auf `src/localStore.ts` (`localStorage`-Key `bike-archiv:v1`).
- Änderungen an Datenmodell, Validierungsregeln oder initialem Seed **immer konsistent** in beiden Schichten pflegen:
  - Server: `server/db.mjs`, `server/app.mjs`, `server/seed.mjs`, `server/validation.mjs`
  - Browser-Store: `src/localStore.ts`, `src/initialSeed.ts`, `src/validation.ts`, `src/api.ts`, `src/types.ts`

## Fachliche Invarianten
- **Initialer Seed:** Specialized Status 160 (`SPECIALIZED_STATUS_160_ID`) mit 21 verbauten Teilen (`status: 'in_use'`). Nach manuellem Löschen darf kein automatischer Re-Seed stattfinden.
- **Teile-Status:** `in_use` erfordert eine gültige `bikeId`. Ein Statuswechsel auf `in_stock` oder `defective` setzt `bikeId` auf `null`.
- **Bike-Löschung:** Beim Löschen eines Bikes werden alle dort verbauten Teile auf `in_stock` (`bikeId: null`) verschoben.
- **Backup-Import:** `POST /api/import` und der Browser-Store ersetzen den Bestand nach vollständiger Validierung atomar.

## Sicherheits- & Qualitätsregeln
- SQL-Abfragen ausschließlich parametrisiert ausführen (`server/db.mjs`).
- Schreibende API-Requests (`POST`, `PUT`, `PATCH`, `DELETE`) erwarten den CSRF-Schutzheader `X-Bike-Archiv-Request: 1`.
- Shop-URLs strikt auf `http:` / `https:` validieren; Security-Header beibehalten.
- Niemals Secrets, Tokens oder interne Stacktraces ausgeben, loggen oder committen.
- Produktionsreifer Code ohne Stubs, `TODO`-Platzhalter oder Fake-Daten.
- UI-Texte klar und sachlich halten (keine erklärenden Untertitel unter Überschriften, keine Buzzword-Badges).

## Befehle & Git-Workflow
- Abhängigkeiten installieren: `npm ci`
- Build & Typprüfung: `npm run build` (`tsc --noEmit && vite build`)
- Tests ausführen: `npm test`
- Server starten: `npm start` (`node server/index.mjs`)
- Größere Änderungen auf Feature-Branches entwickeln, Conventional Commits verwenden (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`) und vor jedem Push `npm run build && npm test` grün ausführen.
