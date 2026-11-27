#!/usr/bin/env bash
set -euo pipefail

# Bike Archiv - Update-Skript mit Vorab-Backup, Build, Health-Check und Rollback

DEFAULT_APP_DIR="/opt/bike-archiv"
DEFAULT_ENV_FILE="/etc/bike-archiv/bike-archiv.env"
DEFAULT_DB_PATH="/var/lib/bike-archiv/bike-archiv.sqlite"
DEFAULT_SERVICE="bike-archiv"

APP_DIR="${BIKE_ARCHIV_APP_DIR:-$DEFAULT_APP_DIR}"
ENV_FILE="${BIKE_ARCHIV_ENV_FILE:-$DEFAULT_ENV_FILE}"
DB_PATH="${BIKE_ARCHIV_DB_PATH:-$DEFAULT_DB_PATH}"
SERVICE_NAME="${BIKE_ARCHIV_SERVICE:-$DEFAULT_SERVICE}"

CLI_BRANCH=""
CHECK_ONLY="0"
DRY_RUN="0"
NO_RESTART="0"

info() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARNUNG] %s\n' "$*" >&2
}

err() {
  printf '[FEHLER] %s\n' "$*" >&2
}

usage() {
  cat <<'EOF'
Bike Archiv - Updater

Aktualisiert Bike Archiv sauber über Git, erstellt vorab ein SQLite-Backup,
baut Frontend und Server-Artefakte neu, startet den Dienst und prüft /api/health.
Bei einem fehlgeschlagenen Build oder Health-Check wird automatisch auf den
vorherigen Commit zurückgerollt.

Verwendung:
  bike-archiv-update [OPTIONEN]
  ./deploy/proxmox/update.sh [OPTIONEN]

Optionen:
  --branch <BRANCH>   Git-Branch für das Update (Standard: aktueller Branch)
  --check             Nur prüfen, ob ein Update auf origin verfügbar ist
  --dry-run           Ablauf prüfen, ohne Änderungen am Dateisystem vorzunehmen
  --no-restart        Systemd-Dienst nicht neu starten (z. B. Standalone)
  -h, --help          Diese Hilfe anzeigen
EOF
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
      --dry-run)
        DRY_RUN="1"
        shift
        ;;
      --no-restart)
        NO_RESTART="1"
        shift
        ;;
      --branch=*)
        CLI_BRANCH="${1#*=}"
        shift
        ;;
      --branch)
        if [ "$#" -lt 2 ]; then
          err "Option --branch erfordert einen Wert."
          exit 1
        fi
        CLI_BRANCH="$2"
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

load_env_defaults() {
  if [ -r "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a
    . "$ENV_FILE"
    set +a
    if [ -n "${DB_PATH:-}" ] && [ -z "${BIKE_ARCHIV_DB_PATH:-}" ]; then
      DB_PATH="$DB_PATH"
    fi
  fi
  APP_PORT="${PORT:-3001}"
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
  else
    cp "$DB_PATH" "$backup_file"
  fi
  if id -u bike-archiv >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
    chown -R bike-archiv:bike-archiv "$backup_dir"
  fi
  info "Vorab-Backup erstellt: $backup_file"
}

ensure_runtime_dirs() {
  local db_dir
  db_dir="$(dirname "$DB_PATH")"
  mkdir -p "$db_dir" "${db_dir}/uploads" "${db_dir}/backups"
  if id -u bike-archiv >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
    chown -R bike-archiv:bike-archiv "$db_dir" "$APP_DIR"
  fi
}

restart_and_verify() {
  if [ "$NO_RESTART" = "1" ]; then
    return 0
  fi
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    info "Starte Dienst ${SERVICE_NAME} neu..."
    systemctl restart "$SERVICE_NAME"
    local ok=0
    for _ in $(seq 1 20); do
      if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
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

rollback_to_commit() {
  local prev_commit="$1"
  warn "Update fehlgeschlagen – rolle zurück auf Commit ${prev_commit}..."
  git -C "$APP_DIR" reset --hard "$prev_commit"
  (
    cd "$APP_DIR"
    npm ci
    npm run build
    npm prune --omit=dev
  )
  ensure_runtime_dirs
  restart_and_verify || true
}

main() {
  parse_args "$@"

  if [ ! -d "$APP_DIR" ] && [ -f "./package.json" ] && [ -d "./.git" ]; then
    APP_DIR="$(pwd)"
  fi

  if [ ! -d "$APP_DIR/.git" ]; then
    err "Kein Git-Repository unter $APP_DIR gefunden."
    exit 1
  fi

  load_env_defaults

  local branch="$CLI_BRANCH"
  if [ -z "$branch" ]; then
    branch="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)"
    if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
      branch="main"
    fi
  fi

  local prev_commit
  prev_commit="$(git -C "$APP_DIR" rev-parse HEAD)"

  if [ "$DRY_RUN" = "1" ]; then
    info "Dry-Run aktiv (Verzeichnis: $APP_DIR, Branch: $branch, DB: $DB_PATH)."
    info "Aktueller Commit: ${prev_commit:0:7}"
    exit 0
  fi

  info "Prüfe Updates auf origin/${branch}..."
  git -C "$APP_DIR" fetch origin "$branch"
  local remote_commit
  remote_commit="$(git -C "$APP_DIR" rev-parse "origin/${branch}")"

  if [ "$CHECK_ONLY" = "1" ]; then
    if [ "$prev_commit" = "$remote_commit" ]; then
      info "Bike Archiv ist aktuell (${prev_commit:0:7})."
    else
      info "Update verfügbar: ${prev_commit:0:7} -> ${remote_commit:0:7} (Branch ${branch})."
    fi
    exit 0
  fi

  if [ "$prev_commit" = "$remote_commit" ]; then
    info "Quellcode ist bereits aktuell (${prev_commit:0:7}). Prüfe Build & Datenbank-Migration..."
  else
    create_pre_update_backup
    info "Spiele Update ein (${prev_commit:0:7} -> ${remote_commit:0:7})..."
    git -C "$APP_DIR" pull --ff-only origin "$branch"
  fi

  if ! (
    cd "$APP_DIR"
    npm ci
    npm run build
    npm prune --omit=dev
  ); then
    rollback_to_commit "$prev_commit"
    err "Build während des Updates fehlgeschlagen. Vorheriger Stand wurde wiederhergestellt."
    exit 1
  fi

  ensure_runtime_dirs

  if ! restart_and_verify; then
    rollback_to_commit "$prev_commit"
    err "Health-Check nach dem Update fehlgeschlagen. Vorheriger Stand wurde wiederhergestellt."
    exit 1
  fi

  info "Bike Archiv erfolgreich aktualisiert."
}

main "$@"
