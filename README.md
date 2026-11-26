# Bike Archiv

Webanwendung zur Verwaltung von Fahrrädern mit Seriennummern, Fahrradteilen mit Statusverwaltung (`in Verwendung`, `im Lager`, `defekt`) und Bike-Zuordnung sowie einer Bestellliste mit Übernahme ins Lager. Als initialer Datensatz ist das Specialized Status 160 mit 21 verbauten Komponenten hinterlegt.

## Voraussetzung

- **Node.js >= 22.5.0** (für das integrierte Modul `node:sqlite`; für den Produktivbetrieb sind keine externen Laufzeit-Pakete erforderlich)

## Direktstart (ohne `npm install`)

Das Frontend ist im Ordner `dist/` bereits fertig gebaut enthalten.

1. ZIP-Archiv entpacken (`bike-archiv/`).
2. Im Ordner `bike-archiv` den Server starten:
   ```bash
   node server/index.mjs
   ```
   Alternativ:
   ```bash
   npm start
   ```
3. Im Browser `http://127.0.0.1:3001` öffnen.

Beim ersten Start wird die SQLite-Datenbank automatisch unter `data/bike-archiv.sqlite` angelegt und mit dem Specialized Status 160 (inkl. 21 Teilen) initialisiert.

## Konfiguration (optional)

- `PORT`: Server-Port (Standard: `3001`)
- `HOST`: Bind-Adresse (Standard: `127.0.0.1`)
- `DB_PATH`: Pfad zur SQLite-Datenbankdatei (Standard: `data/bike-archiv.sqlite`)
- `SERVE_STATIC`: Auf `false` setzen, um das Ausliefern von `dist/` zu deaktivieren

## Entwicklung & Tests (optional)

Falls der Frontend-Quellcode unter `src/` bearbeitet oder Tests ausgeführt werden sollen:

```bash
npm install
npm run dev
npm run build
npm test
```
