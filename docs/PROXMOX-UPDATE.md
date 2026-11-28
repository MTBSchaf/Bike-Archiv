# Proxmox VE Update-Strategie ohne Datenverlust

Diese Anleitung beschreibt, wie der Bike-Archiv-Container auf Proxmox VE regelmäßig und ohne Verlust eigener Daten aktualisiert wird, wenn Änderungen im GitHub-Repository (`main`) vorgenommen werden.

## 1. Strikt getrennte Ablage (Programm vs. Nutzerdaten)

Im Proxmox-LXC-Container liegen Programmcode und laufende Nutzerdaten in vollständig getrennten Verzeichnissen:

| Bereich | Pfad im Container | Verhalten bei Updates |
| --- | --- | --- |
| **Server-Programm & Frontend** | `/opt/bike-archiv` | Wird per Git (`pull --ff-only`) aktualisiert und in `dist/` neu gebaut |
| **SQLite-Datenbank** | `/var/lib/bike-archiv/bike-archiv.sqlite` | Bleibt unberührt; Schema-Migrationen und Katalog-Sync laufen nicht-destruktiv beim Start |
| **Hochgeladene Bilder** | `/var/lib/bike-archiv/uploads` | Bleibt vollständig erhalten (nicht im Git-Verzeichnis) |
| **Automatische Vorab-Backups** | `/var/lib/bike-archiv/backups` | Vor jedem Update wird ein WAL-sicheres Backup angelegt (Standard: 14 Stück aufbewahrt) |
| **Dienst-Konfiguration** | `/etc/bike-archiv/bike-archiv.env` | Bleibt unverändert erhalten |

## 2. Regelmäßiger Update-Workflow

1. Änderungen lokal im Code vornehmen, mit `npm run build`, `npm test` und `npm run check:repo` prüfen und auf `main` pushen.
2. Die GitHub-Actions-CI (`.github/workflows/ci.yml`) prüft Build, Tests und Repository-Hygiene.
3. Der Proxmox-Container aktualisiert sich **automatisch nach Zeitplan** (über `bike-archiv-auto-update.timer`, Standard: täglich um `04:00:00`) **oder sofort auf Abruf** vom Proxmox-Host.

## 3. Automatische Updates im Container verwalten

Neue Container über `deploy/proxmox/install.sh` richten den automatischen Timer standardmäßig ein (abschaltbar per `--auto-update off`).

Für bereits bestehende Container genügt auf dem **Proxmox-VE-Host** ein einzelner Befehl, um den aktuellen Updater und den täglichen Timer nachträglich einzurichten:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MTBSchaf/Bike-Archiv/main/deploy/proxmox/proxmox-update.sh)" -- --enable-auto-update
```

Weitere Optionen für den Timer:

- **Eigenen Zeitplan setzen** (z. B. wöchentlich sonntags um 03:30 Uhr):
  ```bash
  pct exec <CTID> -- bike-archiv-update --enable-auto-update "Sun *-*-* 03:30:00"
  ```
- **Timer-Status prüfen:**
  ```bash
  pct exec <CTID> -- bike-archiv-update --auto-update-status
  ```
- **Automatische Updates deaktivieren:**
  ```bash
  pct exec <CTID> -- bike-archiv-update --disable-auto-update
  ```

Der Timer startet `bike-archiv-update --auto`. Liegen auf `origin/main` keine neuen Commits vor und existiert `dist/index.html`, beendet sich der Lauf sofort ohne Neustart und ohne unnötiges Backup.

## 4. Sofort-Update vom Proxmox-Host ausführen

Wenn Änderungen direkt nach einem Push eingespielt werden sollen:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MTBSchaf/Bike-Archiv/main/deploy/proxmox/proxmox-update.sh)"
```

Mit zusätzlichem Proxmox-LXC-Snapshot vor dem Update (falls vom Storage unterstützt):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MTBSchaf/Bike-Archiv/main/deploy/proxmox/proxmox-update.sh)" -- --snapshot
```

Nur prüfen, ob ein Update vorliegt:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MTBSchaf/Bike-Archiv/main/deploy/proxmox/proxmox-update.sh)" -- --check
```

Bei mehreren Containern lässt sich die Ziel-CTID explizit angeben (`--ctid <ID>`).

## 5. Datensicherheit, Rollback & manuelle Wiederherstellung

Bei jedem echten Update (`prev_commit != remote_commit`) durchläuft `deploy/proxmox/update.sh` diese Schutzschritte:

1. **Sperre (`Lock`):** Verhindert gleichzeitige Updates durch Timer und manuellen Aufruf.
2. **Arbeitsbaum-Prüfung:** Bricht sicher ab, falls getrackte Dateien unter `/opt/bike-archiv` lokal verändert wurden.
3. **WAL-sicheres Vorab-Backup:** Erstellt `bike-archiv-pre-update-<Zeitstempel>.sqlite` per `sqlite3 .backup` (bzw. `VACUUM INTO` über `node:sqlite`), prüft die Datei per `PRAGMA quick_check;` und rotiert ältere Sicherungen (`--keep-backups`, Standard `14`).
4. **Fast-Forward-Pull & Build:** Zieht neue Commits (`--ff-only`, bei Shallow-Clones automatisches `--unshallow`), baut Frontend & Server neu.
5. **Health-Check & Rollback:** Prüft `http://127.0.0.1:<PORT>/api/health` auf `"ok":true`. Schlägt der Build oder der Start nach dem Update fehl, rollt das Skript automatisch auf den vorherigen Commit (und nach fehlgeschlagenem Neustart zusätzlich auf das Vorab-Backup) zurück.

### Manuelle Wiederherstellung eines Backups im Container

```bash
pct exec <CTID> -- bash -c '
  systemctl stop bike-archiv
  ls -lh /var/lib/bike-archiv/backups
  cp /var/lib/bike-archiv/backups/<BACKUP-DATEI>.sqlite /var/lib/bike-archiv/bike-archiv.sqlite
  rm -f /var/lib/bike-archiv/bike-archiv.sqlite-wal /var/lib/bike-archiv/bike-archiv.sqlite-shm
  chown bike-archiv:bike-archiv /var/lib/bike-archiv/bike-archiv.sqlite
  systemctl start bike-archiv
'
```

## 6. Repository-Hygiene (Nur Server-Programm & Beispiel)

Im GitHub-Repository wird ausschließlich das Server-Programm (Frontend-Quellcode, Node.js-Server, Proxmox-Skripte, Tests und Dokumentation) inklusive des einen initialen Beispiels (**Specialized Status 160** in `server/seed.mjs`) versioniert. Persönliche Fahrräder, Seriennummern, SQLite-Datenbanken, Uploads, Backups oder Build-Archive sind über `.gitignore` ausgeschlossen und werden in CI sowie lokal per `npm run check:repo` blockiert.
