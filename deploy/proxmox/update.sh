#!/usr/bin/env bash
set -euo pipefail

# Bike Archiv - Update-Skript mit Vorab-Backup, Build, Health-Check,
# automatischer Timer-Steuerung und Code+DB-Rollback

DEFAULT_APP_DIR="/opt/bike-archiv"
DEFAULT_ENV_FILE="/etc/bike-archiv/bike-archiv.env"
DEFAULT_DB_PATH="/var/lib/bike-archiv/bike-archiv.sqlite"
DEFAULT_SERVICE="bike-archiv"
DEFAULT_BACKUP_RETENTION="14"
DEFAULT_AUTO_SCHEDULE="*-*-* 04:00:00"

APP_DIR="${BIKE_ARCHIV_APP_DIR:-$DEFAULT_APP_DIR}"
ENV_FILE="${BIKE_ARCHIV_ENV_FILE:-$DEFAULT_ENV_FILE}"
DB_PATH="${BIKE_ARCHIV_DB_PATH:-$DEFAULT_DB_PATH}"
UPLOADS_DIR="${BIKE_ARCHIV_UPLOADS_DIR:-}"
SERVICE_NAME="${BIKE_ARCHIV_SERVICE:-$DEFAULT_SERVICE}"
SYSTEMD_DIR="${BIKE_ARCHIV_SYSTEMD_DIR:-/etc/systemd/system}"
UPDATE_BIN="${BIKE_ARCHIV_UPDATE_BIN:-/usr/local/bin/bike-archiv-update}"
BACKUP_RETENTION="${BIKE_ARCHIV_BACKUP_RETENTION:-$DEFAULT_BACKUP_RETENTION}"

CLI_BRANCH=""
CLI_KEEP_BACKUPS=""
CHECK_ONLY="0"
AUTO_MODE="0"
FORCE_REBUILD="0"
DRY_RUN="0"
NO_RESTART="0"
ENABLE_AUTO_UPDATE="0"
DISABLE_AUTO_UPDATE="0"
AUTO_UPDATE_STATUS="0"
AUTO_UPDATE_SCHEDULE="$DEFAULT_AUTO_SCHEDULE"

LOCK_DIR=""
LOCK_HELD="0"
PRE_UPDATE_BACKUP_FILE=""

info() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARNUNG] %s\n' "$*" >&2
}

err() {
  printf '[FEHLER] %s\n' "$*" >&2
}

release_lock() {
  if [ "$LOCK_HELD" = "1" ] && [ -n "$LOCK_DIR" ]; then
    rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
    LOCK_HELD="0"
  fi
}

trap release_lock EXIT

acquire_lock() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  LOCK_DIR="${target_dir}/.bike-archiv-update.lock"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    err "Ein weiteres Bike-Archiv-Update läuft bereits (Lock: $LOCK_DIR)."
    exit 1
  fi
  LOCK_HELD="1"
}

usage() {
  cat <<'EOF'
Bike Archiv - Updater

Aktualisiert Bike Archiv sauber über Git, erstellt vorab ein WAL-sicheres SQLite-Backup,
prüft die Backup-Integrität, rotiert alte Backups, baut Frontend und Server neu,
startet den Dienst und prüft /api/health. Bei Fehlern wird automatisch auf den
vorherigen Commit (und nach fehlgeschlagenem Neustart auf das Vorab-Backup) zurückgerollt.

Verwendung:
  bike-archiv-update [OPTIONEN]
  ./deploy/proxmox/update.sh [OPTIONEN]

Optionen:
  --branch <BRANCH>               Git-Branch für das Update (Standard: aktueller Branch)
  --check                         Nur prüfen, ob ein Update auf origin verfügbar ist
  --auto, --if-changed            Nur bauen/neustarten, wenn neue Commits vorliegen oder dist/ fehlt
  --force                         Build und Neustart erzwingen, auch ohne neue Commits
  --keep-backups <N>              Anzahl aufzubewahrender Vorab-Backups (Standard: 14)
  --enable-auto-update [ZEITPLAN] Systemd-Timer für automatische Updates einrichten (Standard: *-*-* 04:00:00)
  --disable-auto-update           Systemd-Timer für automatische Updates deaktivieren
  --auto-update-status            Status des automatischen Update-Timers anzeigen
  --dry-run                       Ablauf prüfen, ohne Änderungen am Dateisystem vorzunehmen
  --no-restart                    Systemd-Dienst nicht neu starten (z. B. Standalone)
  -h, --help                      Diese Hilfe anzeigen
EOF
}

validate_branch() {
  local raw="$1"
  if [ -z "$raw" ] || printf '%s' "$raw" | grep -Eq '(^\-|\.\.|[[:space:]])' || ! printf '%s' "$raw" | grep -Eq '^[a-zA-Z0-9._/-]+$'; then
    err "Ungültiger Branch-Name '$raw'."
    exit 1
  fi
}

validate_retention() {
  local raw="$1"
  if ! printf '%s' "$raw" | grep -Eq '^[0-9]+$' || [ "$((10#$raw))" -lt 1 ] || [ "$((10#$raw))" -gt 365 ]; then
    err "Ungültige Backup-Anzahl '$raw'. Erlaubt ist eine Ganzzahl zwischen 1 und 365."
    exit 1
  fi
}

validate_schedule() {
  local raw="$1"
  if [ -z "$raw" ] || ! printf '%s' "$raw" | grep -Eq '^[a-zA-Z0-9:*.,/_ -]{1,64}$'; then
    err "Ungültiger systemd-Zeitplan '$raw' (Beispiel: *-*-* 04:00:00 oder daily)."
    exit 1
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -h|--help)
        usage
        exit 0
        ;;
      --check)
        CHECK_ONLY="1"
        shift
        ;;
      --auto|--if-changed)
        AUTO_MODE="1"
        shift
        ;;
      --force)
        FORCE_REBUILD="1"
        shift
        ;;
      --dry-run)
        DRY_RUN="1"
        shift
        ;;
      --no-restart)
        NO_RESTART="1"
        shift
        ;;
      --enable-auto-update=*)
        ENABLE_AUTO_UPDATE="1"
        AUTO_UPDATE_SCHEDULE="${1#*=}"
        validate_schedule "$AUTO_UPDATE_SCHEDULE"
        shift
        ;;
      --enable-auto-update)
        ENABLE_AUTO_UPDATE="1"
        if [ "$#" -ge 2 ] && [ "${2#-}" = "$2" ]; then
          AUTO_UPDATE_SCHEDULE="$2"
          validate_schedule "$AUTO_UPDATE_SCHEDULE"
          shift 2
        else
          shift
        fi
        ;;
      --disable-auto-update)
        DISABLE_AUTO_UPDATE="1"
        shift
        ;;
      --auto-update-status)
        AUTO_UPDATE_STATUS="1"
        shift
        ;;
      --keep-backups=*)
        CLI_KEEP_BACKUPS="${1#*=}"
        validate_retention "$CLI_KEEP_BACKUPS"
        shift
        ;;
      --keep-backups)
        if [ "$#" -lt 2 ]; then
          err "Option --keep-backups erfordert eine Ganzzahl."
          exit 1
        fi
        CLI_KEEP_BACKUPS="$2"
        validate_retention "$CLI_KEEP_BACKUPS"
        shift 2
        ;;
      --branch=*)
        CLI_BRANCH="${1#*=}"
        validate_branch "$CLI_BRANCH"
        shift
        ;;
      --branch)
        if [ "$#" -lt 2 ]; then
          err "Option --branch erfordert einen Wert."
          exit 1
        fi
        CLI_BRANCH="$2"
        validate_branch "$CLI_BRANCH"
        shift 2
        ;;
      *)
        err "Unbekannte Option: $1"
        usage >&2
        exit 1
        ;;
    esac
  done
}

run_git() {
  git -C "$APP_DIR" -c "safe.directory=$APP_DIR" "$@"
}

load_env_defaults() {
  local override_db="${BIKE_ARCHIV_DB_PATH:-}"
  local override_uploads="${BIKE_ARCHIV_UPLOADS_DIR:-}"
  local override_port="${BIKE_ARCHIV_PORT:-}"
  local override_retention="${BIKE_ARCHIV_BACKUP_RETENTION:-}"

  if [ -r "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a
    . "$ENV_FILE"
    set +a
  fi

  if [ -n "$override_db" ]; then
    DB_PATH="$override_db"
  elif [ -n "${DB_PATH:-}" ]; then
    DB_PATH="$DB_PATH"
  else
    DB_PATH="$DEFAULT_DB_PATH"
  fi

  if [ -n "$override_uploads" ]; then
    UPLOADS_DIR="$override_uploads"
  elif [ -n "${UPLOADS_DIR:-}" ]; then
    UPLOADS_DIR="$UPLOADS_DIR"
  else
    UPLOADS_DIR="$(dirname "$DB_PATH")/uploads"
  fi

  if [ -n "$override_port" ]; then
    APP_PORT="$override_port"
  else
    APP_PORT="${PORT:-3001}"
  fi

  if [ -n "$CLI_KEEP_BACKUPS" ]; then
    BACKUP_RETENTION="$CLI_KEEP_BACKUPS"
  elif [ -n "$override_retention" ]; then
    BACKUP_RETENTION="$override_retention"
  elif [ -n "${BACKUP_RETENTION:-}" ]; then
    BACKUP_RETENTION="$BACKUP_RETENTION"
  else
    BACKUP_RETENTION="$DEFAULT_BACKUP_RETENTION"
  fi
  validate_retention "$BACKUP_RETENTION"
}

is_real_sqlite_file() {
  local file="$1"
  [ -f "$file" ] || return 1
  local header=""
  header="$(head -c 15 "$file" 2>/dev/null | tr -d '\0' || true)"
  [ "$header" = "SQLite format 3" ]
}

verify_sqlite_backup() {
  local backup_file="$1"
  if [ ! -s "$backup_file" ]; then
    err "Erstelltes Vorab-Backup ist leer oder fehlt: $backup_file"
    return 1
  fi
  if is_real_sqlite_file "$backup_file" && command -v node >/dev/null 2>&1; then
    node -e '
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(process.argv[1], { readOnly: true });
      const row = db.prepare("PRAGMA quick_check;").get();
      db.close();
      const val = row ? Object.values(row)[0] : "";
      if (val !== "ok") process.exit(1);
    ' "$backup_file"
  fi
  return 0
}

prune_old_backups() {
  local backup_dir="$1"
  local keep_count="$((10#$BACKUP_RETENTION))"
  local files
  files="$(
    find "$backup_dir" -maxdepth 1 -type f -name 'bike-archiv-pre-update-*.sqlite' 2>/dev/null \
      | LC_ALL=C sort -r || true
  )"
  if [ -z "$files" ]; then
    return 0
  fi

  local idx=0
  local removed=0
  local file
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    idx=$((idx + 1))
    if [ "$idx" -gt "$keep_count" ]; then
      rm -f "$file"
      removed=$((removed + 1))
    fi
  done <<< "$files"

  if [ "$removed" -gt 0 ]; then
    info "Alte Vorab-Backups bereinigt: $removed entfernt (behalte maximal $keep_count)."
  fi
}

create_pre_update_backup() {
  if [ ! -f "$DB_PATH" ]; then
    info "Keine bestehende Datenbank unter $DB_PATH gefunden – Backup übersprungen."
    return 0
  fi
  local db_dir
  db_dir="$(dirname "$DB_PATH")"
  local backup_dir="${db_dir}/backups"
  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local backup_file="${backup_dir}/bike-archiv-pre-update-${timestamp}.sqlite"

  mkdir -p "$backup_dir"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '${backup_file}'"
  elif is_real_sqlite_file "$DB_PATH" && command -v node >/dev/null 2>&1; then
    node -e '
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(process.argv[1], { readOnly: true });
      const dest = process.argv[2].replace(/\x27/g, "\x27\x27");
      db.exec(`VACUUM INTO \x27${dest}\x27;`);
      db.close();
    ' "$DB_PATH" "$backup_file"
  else
    cp "$DB_PATH" "$backup_file"
  fi

  verify_sqlite_backup "$backup_file"
  PRE_UPDATE_BACKUP_FILE="$backup_file"

  if id -u bike-archiv >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
    chown -R bike-archiv:bike-archiv "$backup_dir"
  fi
  info "Vorab-Backup erstellt: $backup_file"
  prune_old_backups "$backup_dir"
}

ensure_runtime_dirs() {
  local db_dir
  db_dir="$(dirname "$DB_PATH")"
  mkdir -p "$db_dir" "$UPLOADS_DIR" "${db_dir}/backups"
  if id -u bike-archiv >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
    chown -R bike-archiv:bike-archiv "$db_dir" "$UPLOADS_DIR" "$APP_DIR"
  fi
}

has_active_systemd_service() {
  command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1
}

restart_and_verify() {
  if [ "$NO_RESTART" = "1" ]; then
    return 0
  fi
  if has_active_systemd_service; then
    info "Starte Dienst ${SERVICE_NAME} neu..."
    systemctl restart "$SERVICE_NAME"
    local ok=0
    local body=""
    for _ in $(seq 1 20); do
      body="$(curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" 2>/dev/null || true)"
      if printf '%s' "$body" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
        ok=1
        break
      fi
      sleep 1
    done
    if [ "$ok" -ne 1 ]; then
      return 1
    fi
    info "Health-Check erfolgreich (http://127.0.0.1:${APP_PORT}/api/health)."
  else
    info "Kein aktiver systemd-Dienst ${SERVICE_NAME} gefunden – Neustart übersprungen."
  fi
  return 0
}

restore_pre_update_backup() {
  if [ -z "$PRE_UPDATE_BACKUP_FILE" ] || [ ! -f "$PRE_UPDATE_BACKUP_FILE" ]; then
    return 0
  fi
  warn "Stelle Datenbank aus Vorab-Backup wieder her: $PRE_UPDATE_BACKUP_FILE"
  if [ "$NO_RESTART" != "1" ] && has_active_systemd_service; then
    systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi
  cp "$PRE_UPDATE_BACKUP_FILE" "$DB_PATH"
  rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"
  if id -u bike-archiv >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
    chown bike-archiv:bike-archiv "$DB_PATH"
  fi
}

rollback_to_commit() {
  local prev_commit="$1"
  local restore_db="${2:-0}"
  warn "Update fehlgeschlagen – rolle zurück auf Commit ${prev_commit}..."
  if [ "$restore_db" = "1" ]; then
    restore_pre_update_backup
  fi
  run_git reset --hard "$prev_commit"
  (
    cd "$APP_DIR"
    npm ci
    npm run build
    npm prune --omit=dev
  )
  ensure_runtime_dirs
  restart_and_verify || true
}

manage_auto_update() {
  local service_file="${SYSTEMD_DIR}/bike-archiv-auto-update.service"
  local timer_file="${SYSTEMD_DIR}/bike-archiv-auto-update.timer"

  if [ "$AUTO_UPDATE_STATUS" = "1" ]; then
    if [ -f "$timer_file" ]; then
      local configured_schedule
      configured_schedule="$(awk -F'=' '/^OnCalendar=/ {print $2; exit}' "$timer_file")"
      info "Automatische Updates sind konfiguriert (Zeitplan: ${configured_schedule:-unbekannt}, Timer: $timer_file)."
      if command -v systemctl >/dev/null 2>&1; then
        systemctl status bike-archiv-auto-update.timer --no-pager || true
      fi
    else
      info "Automatische Updates sind nicht eingerichtet ($timer_file fehlt)."
    fi
    return 0
  fi

  if [ "$DISABLE_AUTO_UPDATE" = "1" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      info "Dry-Run aktiv: würde Auto-Update-Timer unter $timer_file deaktivieren."
      return 0
    fi
    if command -v systemctl >/dev/null 2>&1; then
      systemctl disable --now bike-archiv-auto-update.timer >/dev/null 2>&1 || true
    fi
    rm -f "$timer_file" "$service_file"
    if command -v systemctl >/dev/null 2>&1; then
      systemctl daemon-reload >/dev/null 2>&1 || true
    fi
    info "Automatische Updates wurden deaktiviert."
    return 0
  fi

  if [ "$ENABLE_AUTO_UPDATE" = "1" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      info "Dry-Run aktiv: würde Auto-Update-Timer unter $timer_file einrichten (Zeitplan: $AUTO_UPDATE_SCHEDULE)."
      return 0
    fi
    mkdir -p "$SYSTEMD_DIR"
    cat > "$service_file" <<EOF
[Unit]
Description=Bike Archiv automatisches Update
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${UPDATE_BIN} --auto
EOF
    cat > "$timer_file" <<EOF
[Unit]
Description=Regelmäßiger Bike Archiv Update-Timer

[Timer]
OnCalendar=${AUTO_UPDATE_SCHEDULE}
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
EOF
    chmod 644 "$service_file" "$timer_file"
    if command -v systemctl >/dev/null 2>&1; then
      systemctl daemon-reload
      systemctl enable --now bike-archiv-auto-update.timer
    fi
    info "Automatische Updates aktiviert (Zeitplan: $AUTO_UPDATE_SCHEDULE, Timer: $timer_file)."
    return 0
  fi

  return 1
}

pull_updates_fast_forward() {
  local branch="$1"
  if run_git pull --ff-only origin "$branch"; then
    return 0
  fi
  if [ -f "$APP_DIR/.git/shallow" ]; then
    info "Shallow-Clone erkannt – lade vollständige Historie für sauberen Fast-Forward..."
    run_git fetch --unshallow origin "$branch" >/dev/null 2>&1 || true
    if run_git pull --ff-only origin "$branch"; then
      return 0
    fi
  fi
  return 1
}

main() {
  parse_args "$@"

  if [ ! -d "$APP_DIR" ] && [ -f "./package.json" ] && [ -d "./.git" ]; then
    APP_DIR="$(pwd)"
  fi

  load_env_defaults

  if [ "$ENABLE_AUTO_UPDATE" = "1" ] || [ "$DISABLE_AUTO_UPDATE" = "1" ] || [ "$AUTO_UPDATE_STATUS" = "1" ]; then
    manage_auto_update
    exit 0
  fi

  if [ ! -d "$APP_DIR/.git" ]; then
    err "Kein Git-Repository unter $APP_DIR gefunden."
    exit 1
  fi

  local branch="$CLI_BRANCH"
  if [ -z "$branch" ]; then
    branch="$(run_git rev-parse --abbrev-ref HEAD)"
    if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
      branch="main"
    fi
  fi
  validate_branch "$branch"

  local prev_commit
  prev_commit="$(run_git rev-parse HEAD)"

  if [ "$DRY_RUN" = "1" ]; then
    info "Dry-Run aktiv (Verzeichnis: $APP_DIR, Branch: $branch, DB: $DB_PATH, Aufbewahrung: $BACKUP_RETENTION)."
    info "Aktueller Commit: ${prev_commit:0:7}"
    exit 0
  fi

  if [ "$CHECK_ONLY" != "1" ]; then
    acquire_lock "$(dirname "$DB_PATH")"
  fi

  info "Prüfe Updates auf origin/${branch}..."
  run_git fetch origin "$branch"
  local remote_commit
  remote_commit="$(run_git rev-parse "origin/${branch}")"

  if [ "$CHECK_ONLY" = "1" ]; then
    if [ "$prev_commit" = "$remote_commit" ]; then
      info "Bike Archiv ist aktuell (${prev_commit:0:7})."
    else
      info "Update verfügbar: ${prev_commit:0:7} -> ${remote_commit:0:7} (Branch ${branch})."
    fi
    exit 0
  fi

  local dirty_tracked=""
  dirty_tracked="$(run_git status --porcelain --untracked-files=no || true)"
  if [ -n "$dirty_tracked" ]; then
    err "Lokale Änderungen in getrackten Dateien unter $APP_DIR gefunden – Update zur Sicherheit abgebrochen."
    err "Bitte Änderungen prüfen oder bereinigen, bevor ein automatisches Update läuft."
    exit 1
  fi

  if [ "$prev_commit" = "$remote_commit" ]; then
    if [ "$AUTO_MODE" = "1" ] && [ "$FORCE_REBUILD" != "1" ] && [ -f "$APP_DIR/dist/index.html" ]; then
      info "Bike Archiv ist bereits auf dem neuesten Stand (${prev_commit:0:7}) – kein Update erforderlich."
      exit 0
    fi
    if [ "$FORCE_REBUILD" != "1" ] && [ -f "$APP_DIR/dist/index.html" ]; then
      info "Quellcode ist bereits aktuell (${prev_commit:0:7}). Prüfe Laufzeitverzeichnisse & Dienst..."
    else
      info "Quellcode ist aktuell (${prev_commit:0:7}). Baue Anwendung neu..."
    fi
  else
    create_pre_update_backup
    info "Spiele Update ein (${prev_commit:0:7} -> ${remote_commit:0:7})..."
    if ! pull_updates_fast_forward "$branch"; then
      err "Fast-Forward-Pull auf Branch '${branch}' fehlgeschlagen. Vorheriger Stand bleibt unverändert."
      exit 1
    fi
  fi

  if [ "$prev_commit" != "$remote_commit" ] || [ "$FORCE_REBUILD" = "1" ] || [ ! -f "$APP_DIR/dist/index.html" ]; then
    if ! (
      cd "$APP_DIR"
      npm ci
      npm run build
      npm prune --omit=dev
    ); then
      rollback_to_commit "$prev_commit" "0"
      err "Build während des Updates fehlgeschlagen. Vorheriger Stand wurde wiederhergestellt."
      exit 1
    fi
  fi

  ensure_runtime_dirs

  if [ "$prev_commit" != "$remote_commit" ] || [ "$FORCE_REBUILD" = "1" ]; then
    if ! restart_and_verify; then
      rollback_to_commit "$prev_commit" "1"
      err "Health-Check nach dem Update fehlgeschlagen. Vorheriger Code- und Datenbankstand wurde wiederhergestellt."
      exit 1
    fi
  fi

  info "Bike Archiv erfolgreich aktualisiert."
}

main "$@"
