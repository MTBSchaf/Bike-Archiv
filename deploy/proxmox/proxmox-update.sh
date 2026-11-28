#!/usr/bin/env bash
set -euo pipefail

# Bike Archiv - Proxmox VE Host-Updater
# Aktualisiert einen bestehenden Bike-Archiv-LXC-Container vom Proxmox-Host aus,
# optional mit LXC-Snapshot und Einrichtung des automatischen Update-Timers.

DEFAULT_HOSTNAME="bike-archiv"
DEFAULT_BRANCH="main"
DEFAULT_AUTO_SCHEDULE="*-*-* 04:00:00"

CLI_CTID=""
CLI_BRANCH="$DEFAULT_BRANCH"
CLI_KEEP_BACKUPS=""
CHECK_ONLY="0"
AUTO_MODE="0"
FORCE_REBUILD="0"
TAKE_SNAPSHOT="0"
ENABLE_AUTO_UPDATE="0"
DISABLE_AUTO_UPDATE="0"
AUTO_UPDATE_STATUS="0"
AUTO_UPDATE_SCHEDULE="$DEFAULT_AUTO_SCHEDULE"
DRY_RUN="0"

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
Bike Archiv - Proxmox Host-Updater

Führt Updates für den Bike-Archiv-LXC-Container direkt vom Proxmox-VE-Host aus,
ohne bestehende Datenbanken, Seriennummern oder Bilder zu überschreiben.

Verwendung:
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/MTBSchaf/Bike-Archiv/main/deploy/proxmox/proxmox-update.sh)"
  ./deploy/proxmox/proxmox-update.sh [OPTIONEN]

Optionen:
  --ctid <ID>                     Container-ID (optional; wird sonst automatisch erkannt)
  --branch <BRANCH>               Git-Branch für das Update (Standard: main)
  --check                         Nur prüfen, ob ein Update verfügbar ist
  --auto                          Nur aktualisieren, wenn neue Commits vorliegen
  --force                         Build und Neustart erzwingen
  --snapshot                      Vor dem Update zusätzlich einen LXC-Snapshot anlegen
  --keep-backups <N>              Anzahl aufzubewahrender SQLite-Vorab-Backups (Standard: 14)
  --enable-auto-update [ZEITPLAN] Automatischen Update-Timer im Container aktivieren
  --disable-auto-update           Automatischen Update-Timer im Container deaktivieren
  --auto-update-status            Status des automatischen Update-Timers anzeigen
  --dry-run                       Erkennung und geplanten Ablauf prüfen, ohne Änderungen
  -h, --help                      Diese Hilfe anzeigen
EOF
}

validate_ctid_syntax() {
  local raw="$1"
  if ! printf '%s' "$raw" | grep -Eq '^[0-9]+$' || [ "$((10#$raw))" -lt 100 ] || [ "$((10#$raw))" -gt 999999999 ]; then
    err "Ungültige Container-ID '$raw'. Erwartet wird eine Ganzzahl ab 100."
    exit 1
  fi
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
      --auto)
        AUTO_MODE="1"
        shift
        ;;
      --force)
        FORCE_REBUILD="1"
        shift
        ;;
      --snapshot)
        TAKE_SNAPSHOT="1"
        shift
        ;;
      --dry-run)
        DRY_RUN="1"
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
      --ctid=*)
        CLI_CTID="${1#*=}"
        validate_ctid_syntax "$CLI_CTID"
        shift
        ;;
      --ctid)
        if [ "$#" -lt 2 ]; then
          err "Option --ctid erfordert eine Container-ID."
          exit 1
        fi
        CLI_CTID="$2"
        validate_ctid_syntax "$CLI_CTID"
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
      *)
        err "Unbekannte Option: $1"
        usage >&2
        exit 1
        ;;
    esac
  done
}

check_root() {
  if [ "$DRY_RUN" = "1" ] || [ "${BIKE_ARCHIV_SKIP_ROOT_CHECK:-0}" = "1" ]; then
    return 0
  fi
  if [ "$(id -u)" -ne 0 ]; then
    err "Bitte als root auf dem Proxmox-VE-Host ausführen."
    exit 1
  fi
}

require_pct() {
  if ! command -v pct >/dev/null 2>&1; then
    err "Proxmox-Werkzeug 'pct' nicht gefunden. Dieses Skript muss auf dem Proxmox-Host laufen."
    exit 1
  fi
}

detect_container_id() {
  if [ -n "$CLI_CTID" ]; then
    if ! pct status "$CLI_CTID" >/dev/null 2>&1; then
      err "Container $CLI_CTID existiert nicht."
      exit 1
    fi
    TARGET_CTID="$CLI_CTID"
    return 0
  fi

  local pct_output=""
  pct_output="$(pct list 2>/dev/null || true)"
  if [ -z "$pct_output" ]; then
    err "Keine LXC-Container auf diesem Host gefunden. Bitte --ctid angeben."
    exit 1
  fi

  local matched_by_name=""
  matched_by_name="$(
    printf '%s\n' "$pct_output" \
      | awk -v target="$DEFAULT_HOSTNAME" 'NR>1 && $NF==target {print $1; exit}' || true
  )"
  if [ -n "$matched_by_name" ]; then
    TARGET_CTID="$matched_by_name"
    info "Container automatisch erkannt (Hostname ${DEFAULT_HOSTNAME}): CTID $TARGET_CTID"
    return 0
  fi

  local candidate
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if pct exec "$candidate" -- test -f /opt/bike-archiv/package.json >/dev/null 2>&1; then
      TARGET_CTID="$candidate"
      info "Container automatisch erkannt (/opt/bike-archiv gefunden): CTID $TARGET_CTID"
      return 0
    fi
  done < <(printf '%s\n' "$pct_output" | awk 'NR>1 && $1 ~ /^[0-9]+$/ {print $1}')

  err "Kein Bike-Archiv-Container automatisch gefunden. Bitte CTID explizit mit --ctid <ID> angeben."
  exit 1
}

ensure_container_running() {
  local status_line=""
  status_line="$(pct status "$TARGET_CTID" 2>/dev/null || true)"
  if ! printf '%s' "$status_line" | grep -q 'running'; then
    info "Container $TARGET_CTID ist gestoppt – starte Container..."
    pct start "$TARGET_CTID"
  fi
}

maybe_create_snapshot() {
  if [ "$TAKE_SNAPSHOT" != "1" ]; then
    return 0
  fi
  local snap_name
  snap_name="pre-update-$(date +%Y%m%d-%H%M%S)"
  info "Erstelle Proxmox-LXC-Snapshot '${snap_name}' für Container $TARGET_CTID..."
  if ! pct snapshot "$TARGET_CTID" "$snap_name" --description "Bike Archiv Vorab-Snapshot vor Update"; then
    warn "LXC-Snapshot wird vom Storage nicht unterstützt oder ist fehlgeschlagen – fahre mit SQLite-Vorab-Backup im Container fort."
  else
    info "LXC-Snapshot '${snap_name}' erstellt."
  fi
}

build_forward_args() {
  FORWARD_ARGS=()
  if [ "$CHECK_ONLY" = "1" ]; then
    FORWARD_ARGS+=(--check)
  fi
  if [ "$AUTO_MODE" = "1" ]; then
    FORWARD_ARGS+=(--auto)
  fi
  if [ "$FORCE_REBUILD" = "1" ]; then
    FORWARD_ARGS+=(--force)
  fi
  if [ -n "$CLI_KEEP_BACKUPS" ]; then
    FORWARD_ARGS+=(--keep-backups "$CLI_KEEP_BACKUPS")
  fi
  if [ "$ENABLE_AUTO_UPDATE" = "1" ]; then
    FORWARD_ARGS+=(--enable-auto-update "$AUTO_UPDATE_SCHEDULE")
  elif [ "$DISABLE_AUTO_UPDATE" = "1" ]; then
    FORWARD_ARGS+=(--disable-auto-update)
  elif [ "$AUTO_UPDATE_STATUS" = "1" ]; then
    FORWARD_ARGS+=(--auto-update-status)
  else
    FORWARD_ARGS+=(--branch "$CLI_BRANCH")
  fi
}

run_container_update() {
  build_forward_args
  info "Führe Update-Befehl in Container $TARGET_CTID aus..."
  pct exec "$TARGET_CTID" -- bash -euo pipefail -s -- "$CLI_BRANCH" "${FORWARD_ARGS[@]}" <<'CONTAINER_UPDATE_EOF'
BRANCH="$1"
shift

if command -v git >/dev/null 2>&1; then
  if ! git config --system --get-all safe.directory 2>/dev/null | grep -Fxq '/opt/bike-archiv'; then
    git config --system --add safe.directory /opt/bike-archiv
  fi
fi

if [ ! -x /opt/bike-archiv/deploy/proxmox/update.sh ]; then
  echo "[INFO] Älterer Container-Stand erkannt – lade aktuellen Updater von origin/${BRANCH}..."
  git -C /opt/bike-archiv -c safe.directory=/opt/bike-archiv fetch origin "$BRANCH"
  tmp_updater="/tmp/bike-archiv-update-bootstrap.sh"
  git -C /opt/bike-archiv -c safe.directory=/opt/bike-archiv show "origin/${BRANCH}:deploy/proxmox/update.sh" > "$tmp_updater"
  chmod 755 "$tmp_updater"
  cat > /usr/local/bin/bike-archiv-update <<'WRAPPER_EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/bike-archiv
if [ -x /opt/bike-archiv/deploy/proxmox/update.sh ]; then
  exec /opt/bike-archiv/deploy/proxmox/update.sh "$@"
fi
echo "Updater unter /opt/bike-archiv/deploy/proxmox/update.sh fehlt." >&2
exit 1
WRAPPER_EOF
  chmod 755 /usr/local/bin/bike-archiv-update
  "$tmp_updater" "$@"
  rm -f "$tmp_updater"
  exit 0
fi

if [ ! -x /usr/local/bin/bike-archiv-update ] || ! grep -q 'deploy/proxmox/update.sh' /usr/local/bin/bike-archiv-update; then
  cat > /usr/local/bin/bike-archiv-update <<'WRAPPER_EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/bike-archiv
exec /opt/bike-archiv/deploy/proxmox/update.sh "$@"
WRAPPER_EOF
  chmod 755 /usr/local/bin/bike-archiv-update
fi

exec /usr/local/bin/bike-archiv-update "$@"
CONTAINER_UPDATE_EOF
}

main() {
  parse_args "$@"
  check_root
  require_pct
  detect_container_id

  if [ "$DRY_RUN" = "1" ]; then
    build_forward_args
    info "Dry-Run aktiv (CTID: $TARGET_CTID, Branch: $CLI_BRANCH, Snapshot: $TAKE_SNAPSHOT)."
    info "Geplanter Container-Aufruf: bike-archiv-update ${FORWARD_ARGS[*]}"
    exit 0
  fi

  ensure_container_running

  if [ "$CHECK_ONLY" != "1" ] && [ "$AUTO_UPDATE_STATUS" != "1" ] && [ "$DISABLE_AUTO_UPDATE" != "1" ]; then
    maybe_create_snapshot
  fi

  run_container_update
}

main "$@"
