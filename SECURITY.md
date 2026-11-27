# Sicherheitsrichtlinie

## Unterstützte Versionen

| Branch | Unterstützt |
| ------ | ----------- |
| `main` | Ja          |

## Sicherheitslücken melden

Bitte melde Sicherheitslücken **nicht** über öffentliche GitHub-Issues mit reproduzierbaren Exploit-Details. Nutze stattdessen das private Sicherheits-Reporting von GitHub (Security Advisories) oder kontaktiere die Repository-Maintainer direkt.

## Sicherheitskonzept im Projekt

- **SQLite-Abfragen:** Ausschließlich parametrisierte Queries in `server/db.mjs`.
- **CSRF-Schutz:** Schreibende API-Endpunkte prüfen den Header `X-Bike-Archiv-Request: 1`.
- **Eingabe- & URL-Validierung:** Strikte Validierung im Server (`server/validation.mjs`) und Frontend (`src/validation.ts`), Shop-Links nur mit `http:` oder `https:`.
- **Security-Header:** Werden durch den Node.js-HTTP-Server für alle Antworten gesetzt.
