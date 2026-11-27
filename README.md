# Bike Archiv

[![CI](https://github.com/MTBSchaf/Bike-Archiv/actions/workflows/ci.yml/badge.svg)](https://github.com/MTBSchaf/Bike-Archiv/actions/workflows/ci.yml)

Webanwendung zur Verwaltung von Fahrrädern mit Seriennummern, Fahrradteilen mit Statusverwaltung (`in Verwendung`, `im Lager`, `defekt`) und Bike-Zuordnung sowie einer Bestellliste mit Übernahme ins Lager. Als initialer Datensatz ist das Specialized Status 160 mit 21 verbauten Komponenten hinterlegt.

Bike Archiv läuft vollständig serverbasiert mit einem Node.js-HTTP-Server und zentraler SQLite-Datenbank (`node:sqlite`).

## Proxmox VE Installation (Ein Befehl)

Auf dem Proxmox-VE-Host (in der Root-Shell) genügt ein einzelner Befehl, um einen eigenen unprivilegierten Debian-12-LXC-Container einzurichten:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MTBSchaf/Bike-Archiv/main/deploy/proxmox/install.sh)"
```

Während der Installation fragt das Skript **nur** noch die drei gewünschten Ressourcen interaktiv ab:

- **Arbeitsspeicher (RAM):** z. B. `1024`, `2048` oder `2G` (Standard: `1024` MB, mindestens `512` MB)
- **CPU-Kerne (vCPUs):** z. B. `2` oder `4` (Standard: `2`, maximal verfügbare Host-Kerne)
- **Festplattengröße (GB):** z. B. `8`, `16` oder `16G` (Standard: `8` GB, mindestens `4` GB)

Alle weiteren Einstellungen (nächste freie CTID, Hostname `bike-archiv`, aktiver Proxmox-Storage, Netzwerk-Bridge mit DHCP, Port `3001`) werden automatisch ermittelt und übernommen.

Der Installer lädt bei Bedarf das Debian-12-Standard-Template, legt den Container mit den gewählten RAM-, CPU- und Festplattenwerten an, installiert Node.js 22 LTS, baut die Anwendung, richtet einen gehärteten `systemd`-Dienst (`bike-archiv.service`) ein und prüft `/api/health`.

### CLI-Optionen & Dry-Run

Alle Parameter lassen sich bei Bedarf auch vorab per Flag überschreiben (`--help` zeigt alle Optionen):

```bash
./deploy/proxmox/install.sh --ram 2G --cores 2 --disk 16 --dry-run
```

Unterstützte Flags: `--ram`, `--cores`, `--ctid`, `--hostname`, `--disk`, `--port`, `--storage`, `--template-storage`, `--bridge`, `--ip`, `--gateway`, `--repo`, `--branch`, `--yes`, `--dry-run`.

### Container-Daten & Wartung

- **SQLite-Datenbank im Container:** `/var/lib/bike-archiv/bike-archiv.sqlite`
- **Konfiguration im Container:** `/etc/bike-archiv/bike-archiv.env`
- **Status prüfen:** `pct exec <CTID> -- systemctl status bike-archiv`
- **Logs ansehen:** `pct exec <CTID> -- journalctl -u bike-archiv -f`
- **Update einspielen:** `pct exec <CTID> -- bike-archiv-update`

## Direkter Server-Betrieb (Node.js)

- **Voraussetzung:** Node.js `>= 22.5.0` (für `node:sqlite`; im Produktivbetrieb sind keine externen Laufzeit-Pakete nötig)
- Bauen und starten:
  ```bash
  npm ci
  npm run build
  npm start
  ```
- Im Browser `http://127.0.0.1:3001` öffnen.
- Über den Button **Backup** in der Oberfläche lassen sich jederzeit JSON-Backups exportieren und atomar über `POST /api/import` auf den Server einspielen.

### Umgebungsvariablen (optional)

- `PORT`: Server-Port (Standard: `3001`)
- `HOST`: Bind-Adresse (Standard: `127.0.0.1`, im LXC-Container `0.0.0.0`)
- `DB_PATH`: Pfad zur SQLite-Datenbankdatei (Standard: `data/bike-archiv.sqlite`)
- `SERVE_STATIC`: Auf `false` setzen, um das Ausliefern von `dist/` zu deaktivieren

## Entwicklung & Tests

```bash
npm ci
npm run dev
npm run build
npm test
```

## Repository & Zusammenarbeit

- [Mitwirkung & Setup-Anleitung](CONTRIBUTING.md)
- [Sicherheitsrichtlinie](SECURITY.md)
- [Arbeitsanweisungen für KI-Agenten](.github/copilot-instructions.md)
- [CI-Workflow](.github/workflows/ci.yml)
