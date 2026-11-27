# Bike Archiv

[![CI](https://github.com/MTBSchaf/Bike-Archiv/actions/workflows/ci.yml/badge.svg)](https://github.com/MTBSchaf/Bike-Archiv/actions/workflows/ci.yml)

Webanwendung zur Verwaltung von Fahrrädern mit Seriennummern, Fahrradteilen mit Statusverwaltung (`in Verwendung`, `im Lager`, `defekt`) und Bike-Zuordnung sowie einer Bestellliste mit Übernahme ins Lager. Als initialer Datensatz ist das Specialized Status 160 mit 21 verbauten Komponenten hinterlegt.

## Statische Website (ohne Server — für File Manager & Webspace)

Die fertige Website aus `bike-archiv-website.zip` (oder direkt aus dem Ordner `dist/`) benötigt **keinen Node.js-Server**:

1. `bike-archiv-website.zip` entpacken und die Dateien (`index.html` und `assets/`) in einen beliebigen Ordner im File Manager (z. B. `public_html`, `htdocs`, GitHub Pages, Nginx/Apache oder ein lokaler Ordner) hochladen.
2. Alternativ kann `index.html` auch direkt lokal im Browser geöffnet werden.
3. Alle Änderungen werden automatisch lokal im Browser (`localStorage`) gespeichert. Über den Button **Backup** lassen sich jederzeit alle Daten als JSON-Datei exportieren und wieder importieren.

## Wofür der optionale Node.js-Server gebraucht wird

Ein Server wird nur benötigt, wenn die Daten **zentral** statt nur lokal in einem einzelnen Browser gespeichert werden sollen:

- **Geräteübergreifende Synchronisation:** Auf dem Smartphone, Tablet und PC automatisch denselben Stand sehen, ohne JSON-Backups hin- und herkopieren zu müssen.
- **Zentrale SQLite-Datenbank:** Alle Daten liegen in einer festen Datenbankdatei auf dem Server (`data/bike-archiv.sqlite`) und gehen nicht verloren, wenn im Browser Cache oder Website-Daten gelöscht werden.
- **Gemeinsame Nutzung:** Mehrere Personen oder Browser greifen auf denselben Bestand zu.

Die Anwendung erkennt beim Laden automatisch, ob ein Bike-Archiv-Server unter `/api/health` erreichbar ist, und wechselt andernfalls nahtlos in den lokalen Browser-Speicher.

## Optionaler Server-Betrieb

- **Voraussetzung:** Node.js >= 22.5.0 (für `node:sqlite`; im Produktivbetrieb sind keine externen Laufzeit-Pakete erforderlich)
- Server starten:
  ```bash
  node server/index.mjs
  ```
  Alternativ: `npm start`
- Im Browser `http://127.0.0.1:3001` öffnen.

### Konfiguration (optional)

- `PORT`: Server-Port (Standard: `3001`)
- `HOST`: Bind-Adresse (Standard: `127.0.0.1`)
- `DB_PATH`: Pfad zur SQLite-Datenbankdatei (Standard: `data/bike-archiv.sqlite`)
- `SERVE_STATIC`: Auf `false` setzen, um das Ausliefern von `dist/` zu deaktivieren

## Entwicklung & Tests (optional)

```bash
npm install
npm run dev
npm run build
npm test
```

## Repository & Zusammenarbeit

- [Mitwirkung & Setup-Anleitung](CONTRIBUTING.md)
- [Sicherheitsrichtlinie](SECURITY.md)
- [Arbeitsanweisungen für KI-Agenten](.github/copilot-instructions.md)
- [CI-Workflow](.github/workflows/ci.yml)
