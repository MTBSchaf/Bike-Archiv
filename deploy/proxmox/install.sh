#!/usr/bin/env bash
set -euo pipefail

# Bike Archiv - Proxmox VE LXC Ein-Befehl-Installer
# Erstellt einen unprivilegierten Debian-12-LXC-Container mit Node.js 22,
# SQLite-Persistenz und systemd-Dienst.

DEFAULT_REPO_URL="https://github.com/MTBSchaf/Bike-Archiv.git"
DEFAULT_REPO_BRANCH="main"
DEFAULT_HOSTNAME="bike-archiv"
DEFAULT_RAM_MB="1024"
DEFAULT_DISK_GB="8"
DEFAULT_APP_PORT="3001"
DEFAULT_BRIDGE="vmbr0"
DEFAULT_IP_SPEC="dhcp"

CLI_RAM=""
CLI_CORES=""
CLI_CTID=""
CLI_HOSTNAME=""
CLI_DISK=""
CLI_PORT=""
CLI_STORAGE=""
CLI_TEMPLATE_STORAGE=""
CLI_BRIDGE=""
CLI_IP=""
CLI_GATEWAY=""
CLI_REPO=""
CLI_BRANCH=""
ASSUME_YES="0"
DRY_RUN="0"

CT_CREATED="0"
CREATED_CTID=""

info() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARNUNG] %s\n' "$*" >&2
}

err() {
  printf '[FEHLER] %s\n' "$*" >&2
}

cleanup_on_error() {
  local exit_code="$?"
  if [ "$exit_code" -ne 0 ] && [ "$CT_CREATED" = "1" ] && [ -n "$CREATED_CTID" ]; then
    err "Installation fehlgeschlagen (Exit-Code $exit_code)."
    err "Der bereits angelegte Container $CREATED_CTID wurde nicht entfernt."
    err "Zum Bereinigen auf dem Proxmox-Host ausführen: pct destroy $CREATED_CTID --purge"
  fi
}

trap cleanup_on_error EXIT

usage() {
  cat <<'EOF'
Bike Archiv - Proxmox VE LXC Installer

Interaktiv werden ausschließlich Arbeitsspeicher (RAM), CPU-Kerne und
Festplattengröße abgefragt. Alle weiteren Container-Einstellungen (CTID,
Hostname, Storage, Netzwerk/DHCP, Port) werden automatisch ermittelt und
können bei Bedarf über die folgenden Optionen überschrieben werden.

Verwendung:
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/MTBSchaf/Bike-Archiv/main/deploy/proxmox/install.sh)"
  ./deploy/proxmox/install.sh [OPTIONEN]

Optionen:
  --ram <WERT>               Arbeitsspeicher für den Container (z. B. 1024, 2048, 2G)
  --cores <ANZAHL>           Anzahl CPU-Kerne (vCPUs) für den Container (z. B. 2)
  --disk <GB>                Festplattengröße in GB (z. B. 8, 16G; Standard: 8)
  --ctid <ID>                Container-ID (CTID, z. B. 105)
  --hostname <NAME>          Hostname des Containers (Standard: bike-archiv)
  --port <PORT>              HTTP-Port von Bike Archiv (Standard: 3001)
  --storage <STORAGE>        Proxmox-Storage für Rootfs (z. B. local-lvm)
  --template-storage <NAME>  Proxmox-Storage für LXC-Templates (z. B. local)
  --bridge <BRIDGE>          Netzwerk-Bridge (Standard: erkannte Bridge / vmbr0)
  --ip <dhcp|IP/CIDR>        Netzwerkkonfiguration (z. B. dhcp oder 192.168.1.50/24)
  --gateway <IPV4>           IPv4-Gateway (erforderlich bei statischer IP)
  --repo <HTTPS-URL>         Git-Repository-URL (Standard: https://github.com/MTBSchaf/Bike-Archiv.git)
  --branch <BRANCH>          Git-Branch (Standard: main)
  --yes, --non-interactive   Ohne Rückfragen mit gesetzten Werten/Defaults installieren
  --dry-run                  Prüfungen und Abfragen ausführen, ohne Änderungen vorzunehmen
  -h, --help                 Diese Hilfe anzeigen
EOF
}

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

to_upper() {
  printf '%s' "$1" | tr '[:lower:]' '[:upper:]'
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

read_input() {
  local __var_name="$1"
  local __prompt_text="$2"
  local __value=""
  printf '%s' "$__prompt_text"
  if [ "${BIKE_ARCHIV_PROMPT_INPUT:-}" = "stdin" ]; then
    if ! IFS= read -r __value; then
      __value=""
    fi
  elif [ -t 0 ]; then
    if ! IFS= read -r __value; then
      __value=""
    fi
  elif [ -r /dev/tty ]; then
    if ! IFS= read -r __value </dev/tty; then
      __value=""
    fi
  else
    if ! IFS= read -r __value; then
      __value=""
    fi
  fi
  printf -v "$__var_name" '%s' "$__value"
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    local arg="$1"
    local val=""
    case "$arg" in
      -h|--help)
        usage
        exit 0
        ;;
      --yes|--non-interactive)
        ASSUME_YES="1"
        shift
        ;;
      --dry-run)
        DRY_RUN="1"
        shift
        ;;
      --ram=*|--cores=*|--ctid=*|--hostname=*|--disk=*|--port=*|--storage=*|--template-storage=*|--bridge=*|--ip=*|--gateway=*|--repo=*|--branch=*)
        val="${arg#*=}"
        case "${arg%%=*}" in
          --ram) CLI_RAM="$val" ;;
          --cores) CLI_CORES="$val" ;;
          --ctid) CLI_CTID="$val" ;;
          --hostname) CLI_HOSTNAME="$val" ;;
          --disk) CLI_DISK="$val" ;;
          --port) CLI_PORT="$val" ;;
          --storage) CLI_STORAGE="$val" ;;
          --template-storage) CLI_TEMPLATE_STORAGE="$val" ;;
          --bridge) CLI_BRIDGE="$val" ;;
          --ip) CLI_IP="$val" ;;
          --gateway) CLI_GATEWAY="$val" ;;
          --repo) CLI_REPO="$val" ;;
          --branch) CLI_BRANCH="$val" ;;
        esac
        shift
        ;;
      --ram|--cores|--ctid|--hostname|--disk|--port|--storage|--template-storage|--bridge|--ip|--gateway|--repo|--branch)
        if [ "$#" -lt 2 ]; then
          err "Option $arg erfordert einen Wert."
          exit 1
        fi
        val="$2"
        case "$arg" in
          --ram) CLI_RAM="$val" ;;
          --cores) CLI_CORES="$val" ;;
          --ctid) CLI_CTID="$val" ;;
          --hostname) CLI_HOSTNAME="$val" ;;
          --disk) CLI_DISK="$val" ;;
          --port) CLI_PORT="$val" ;;
          --storage) CLI_STORAGE="$val" ;;
          --template-storage) CLI_TEMPLATE_STORAGE="$val" ;;
          --bridge) CLI_BRIDGE="$val" ;;
          --ip) CLI_IP="$val" ;;
          --gateway) CLI_GATEWAY="$val" ;;
          --repo) CLI_REPO="$val" ;;
          --branch) CLI_BRANCH="$val" ;;
        esac
        shift 2
        ;;
      *)
        err "Unbekannte Option: $arg"
        usage >&2
        exit 1
        ;;
    esac
  done
}

require_proxmox_tools() {
  local missing=0
  local cmd
  for cmd in pct pvesm pveam pvesh; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      err "Erforderliches Proxmox-Werkzeug fehlt: $cmd"
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    err "Dieses Skript muss direkt auf einem Proxmox-VE-Host ausgeführt werden."
    exit 1
  fi
}

check_root() {
  if [ "$DRY_RUN" = "1" ] || [ "${BIKE_ARCHIV_SKIP_ROOT_CHECK:-0}" = "1" ]; then
    return 0
  fi
  if [ "$(id -u)" -ne 0 ]; then
    err "Bitte als root auf dem Proxmox-VE-Host ausführen (z. B. direkt in der Proxmox-Shell)."
    exit 1
  fi
}

detect_host_resources() {
  HOST_CPU_CORES=""
  if command -v nproc >/dev/null 2>&1; then
    HOST_CPU_CORES="$(nproc 2>/dev/null || true)"
  fi
  if ! printf '%s' "$HOST_CPU_CORES" | grep -Eq '^[0-9]+$' && [ -r /proc/cpuinfo ]; then
    HOST_CPU_CORES="$(grep -c '^processor' /proc/cpuinfo 2>/dev/null || true)"
  fi
  if ! printf '%s' "$HOST_CPU_CORES" | grep -Eq '^[0-9]+$' && command -v sysctl >/dev/null 2>&1; then
    HOST_CPU_CORES="$(sysctl -n hw.ncpu 2>/dev/null || true)"
  fi
  if ! printf '%s' "$HOST_CPU_CORES" | grep -Eq '^[0-9]+$' || [ "$HOST_CPU_CORES" -lt 1 ]; then
    HOST_CPU_CORES=""
  fi

  HOST_RAM_MB=""
  if command -v free >/dev/null 2>&1; then
    HOST_RAM_MB="$(free -m 2>/dev/null | awk '/^Mem:/ {print $2}' || true)"
  fi
  if ! printf '%s' "$HOST_RAM_MB" | grep -Eq '^[0-9]+$' && [ -r /proc/meminfo ]; then
    HOST_RAM_MB="$(awk '/^MemTotal:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || true)"
  fi
  if ! printf '%s' "$HOST_RAM_MB" | grep -Eq '^[0-9]+$' || [ "$HOST_RAM_MB" -lt 1 ]; then
    HOST_RAM_MB=""
  fi

  ROOTFS_STORAGES="$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active" {print $1}' | tr '\n' ' ' | sed 's/ *$//')"
  TEMPLATE_STORAGES="$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 && $3=="active" {print $1}' | tr '\n' ' ' | sed 's/ *$//')"

  NEXT_CTID="$(pvesh get /cluster/nextid 2>/dev/null | tr -dc '0-9' || true)"
  if [ -z "$NEXT_CTID" ]; then
    NEXT_CTID="100"
    local ctid_attempts=0
    while pct status "$NEXT_CTID" >/dev/null 2>&1 && [ "$ctid_attempts" -lt 1000 ]; do
      NEXT_CTID=$((NEXT_CTID + 1))
      ctid_attempts=$((ctid_attempts + 1))
    done
  fi

  DETECTED_BRIDGE=""
  if command -v ip >/dev/null 2>&1; then
    DETECTED_BRIDGE="$(ip -o link show 2>/dev/null | awk -F': ' '{print $2}' | awk -F'@' '{print $1}' | grep -E '^vmbr[0-9]+' | head -n 1 || true)"
  fi
  if [ -z "$DETECTED_BRIDGE" ]; then
    DETECTED_BRIDGE="$DEFAULT_BRIDGE"
  fi
}

list_contains() {
  local list="$1"
  local target="$2"
  local item
  for item in $list; do
    if [ "$item" = "$target" ]; then
      return 0
    fi
  done
  return 1
}

pick_default_storage() {
  local list="$1"
  local preferred="$2"
  if [ -n "$preferred" ] && list_contains "$list" "$preferred"; then
    printf '%s' "$preferred"
    return 0
  fi
  local first=""
  for first in $list; do
    printf '%s' "$first"
    return 0
  done
  printf '%s' "$preferred"
}

validate_ram_mb() {
  local raw
  raw="$(to_upper "$(trim "$1")")"
  local parsed_mb=""

  if printf '%s' "$raw" | grep -Eq '^[0-9]+$'; then
    parsed_mb="$((10#$raw))"
  elif printf '%s' "$raw" | grep -Eq '^[0-9]+(M|MB)$'; then
    local num="${raw%B}"
    num="${num%M}"
    parsed_mb="$((10#$num))"
  elif printf '%s' "$raw" | grep -Eq '^[0-9]+(G|GB)$'; then
    local num="${raw%B}"
    num="${num%G}"
    if [ "$((10#$num))" -gt 1024 ]; then
      err "RAM-Wert ist zu groß."
      return 1
    fi
    parsed_mb="$((10#$num * 1024))"
  else
    err "Ungültige RAM-Angabe '$1'. Beispiele: 1024, 2048M oder 2G."
    return 1
  fi

  local max_ram="1048576"
  if [ -n "$HOST_RAM_MB" ] && [ "$HOST_RAM_MB" -lt "$max_ram" ]; then
    max_ram="$HOST_RAM_MB"
  fi

  if [ "$parsed_mb" -lt 512 ]; then
    err "Mindestens 512 MB RAM erforderlich (eingegeben: ${parsed_mb} MB)."
    return 1
  fi
  if [ "$parsed_mb" -gt "$max_ram" ]; then
    err "RAM darf maximal ${max_ram} MB betragen (eingegeben: ${parsed_mb} MB)."
    return 1
  fi

  VALIDATED_VALUE="$parsed_mb"
  return 0
}

validate_cores() {
  local raw
  raw="$(trim "$1")"
  if ! printf '%s' "$raw" | grep -Eq '^[0-9]+$'; then
    err "CPU-Kerne müssen eine positive Ganzzahl sein (z. B. 1, 2, 4)."
    return 1
  fi
  local cores="$((10#$raw))"
  local max_cores="128"
  if [ -n "$HOST_CPU_CORES" ]; then
    max_cores="$HOST_CPU_CORES"
  fi
  if [ "$cores" -lt 1 ]; then
    err "Mindestens 1 CPU-Kern erforderlich."
    return 1
  fi
  if [ "$cores" -gt "$max_cores" ]; then
    err "Maximal ${max_cores} CPU-Kerne verfügbar (eingegeben: ${cores})."
    return 1
  fi
  VALIDATED_VALUE="$cores"
  return 0
}

validate_ctid() {
  local raw
  raw="$(trim "$1")"
  if ! printf '%s' "$raw" | grep -Eq '^[0-9]+$'; then
    err "CTID muss eine Ganzzahl ab 100 sein."
    return 1
  fi
  local ctid="$((10#$raw))"
  if [ "$ctid" -lt 100 ] || [ "$ctid" -gt 999999999 ]; then
    err "CTID muss zwischen 100 und 999999999 liegen."
    return 1
  fi
  if pct status "$ctid" >/dev/null 2>&1; then
    err "Container-ID $ctid ist bereits vergeben."
    return 1
  fi
  VALIDATED_VALUE="$ctid"
  return 0
}

validate_hostname() {
  local raw
  raw="$(trim "$1")"
  if ! printf '%s' "$raw" | grep -Eq '^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])$'; then
    err "Ungültiger Hostname '$raw'. Erlaubt sind Buchstaben, Ziffern und Bindestriche (max. 63 Zeichen)."
    return 1
  fi
  VALIDATED_VALUE="$raw"
  return 0
}

validate_disk_gb() {
  local raw
  raw="$(to_upper "$(trim "$1")")"
  if ! printf '%s' "$raw" | grep -Eq '^[0-9]+(G|GB)?$'; then
    err "Festplattengröße muss eine Ganzzahl in GB sein (z. B. 8 oder 16G)."
    return 1
  fi
  raw="${raw%B}"
  raw="${raw%G}"
  local disk="$((10#$raw))"
  if [ "$disk" -lt 4 ] || [ "$disk" -gt 2048 ]; then
    err "Festplattengröße muss zwischen 4 und 2048 GB liegen."
    return 1
  fi
  VALIDATED_VALUE="$disk"
  return 0
}

validate_port() {
  local raw
  raw="$(trim "$1")"
  if ! printf '%s' "$raw" | grep -Eq '^[0-9]+$'; then
    err "Port muss eine Ganzzahl zwischen 1 und 65535 sein."
    return 1
  fi
  local port="$((10#$raw))"
  if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    err "Port muss zwischen 1 und 65535 liegen."
    return 1
  fi
  VALIDATED_VALUE="$port"
  return 0
}

validate_rootfs_storage() {
  local raw
  raw="$(trim "$1")"
  if ! printf '%s' "$raw" | grep -Eq '^[a-zA-Z0-9][a-zA-Z0-9._-]*$'; then
    err "Ungültiger Storage-Name '$raw'."
    return 1
  fi
  if [ -n "$ROOTFS_STORAGES" ] && ! list_contains "$ROOTFS_STORAGES" "$raw"; then
    err "Storage '$raw' wurde nicht als aktiver rootdir-Storage gefunden (verfügbar: $ROOTFS_STORAGES)."
    return 1
  fi
  VALIDATED_VALUE="$raw"
  return 0
}

validate_template_storage() {
  local raw
  raw="$(trim "$1")"
  if ! printf '%s' "$raw" | grep -Eq '^[a-zA-Z0-9][a-zA-Z0-9._-]*$'; then
    err "Ungültiger Template-Storage-Name '$raw'."
    return 1
  fi
  if [ -n "$TEMPLATE_STORAGES" ] && ! list_contains "$TEMPLATE_STORAGES" "$raw"; then
    err "Storage '$raw' wurde nicht als aktiver vztmpl-Storage gefunden (verfügbar: $TEMPLATE_STORAGES)."
    return 1
  fi
  VALIDATED_VALUE="$raw"
  return 0
}

validate_bridge() {
  local raw
  raw="$(trim "$1")"
  if ! printf '%s' "$raw" | grep -Eq '^[a-zA-Z0-9._-]{1,15}$'; then
    err "Ungültiger Bridge-Name '$raw' (max. 15 Zeichen, z. B. vmbr0)."
    return 1
  fi
  VALIDATED_VALUE="$raw"
  return 0
}

is_valid_ipv4() {
  local ip="$1"
  if ! printf '%s' "$ip" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    return 1
  fi
  local old_ifs="$IFS"
  IFS='.'
  set -- $ip
  IFS="$old_ifs"
  if [ "$#" -ne 4 ]; then
    return 1
  fi
  local octet
  for octet in "$1" "$2" "$3" "$4"; do
    if [ "$((10#$octet))" -gt 255 ]; then
      return 1
    fi
  done
  return 0
}

validate_ip_spec() {
  local raw
  raw="$(to_lower "$(trim "$1")")"
  if [ "$raw" = "dhcp" ]; then
    VALIDATED_VALUE="dhcp"
    return 0
  fi
  if ! printf '%s' "$raw" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$'; then
    err "Ungültige IP-Angabe '$1'. Erwartet wird 'dhcp' oder IPv4/CIDR (z. B. 192.168.1.50/24)."
    return 1
  fi
  local ip="${raw%/*}"
  local cidr="${raw#*/}"
  if ! is_valid_ipv4 "$ip"; then
    err "Ungültige IPv4-Adresse '$ip'."
    return 1
  fi
  local cidr_num="$((10#$cidr))"
  if [ "$cidr_num" -lt 1 ] || [ "$cidr_num" -gt 32 ]; then
    err "CIDR-Präfix muss zwischen 1 und 32 liegen."
    return 1
  fi
  VALIDATED_VALUE="${ip}/${cidr_num}"
  return 0
}

validate_gateway() {
  local raw
  raw="$(trim "$1")"
  if ! is_valid_ipv4 "$raw"; then
    err "Ungültiges IPv4-Gateway '$raw' (Beispiel: 192.168.1.1)."
    return 1
  fi
  VALIDATED_VALUE="$raw"
  return 0
}

validate_repo_url() {
  local raw
  raw="$(trim "$1")"
  if ! printf '%s' "$raw" | grep -Eq '^https://[^[:space:]]+$'; then
    err "Repository-URL muss mit https:// beginnen und darf keine Leerzeichen enthalten."
    return 1
  fi
  VALIDATED_VALUE="$raw"
  return 0
}

validate_branch() {
  local raw
  raw="$(trim "$1")"
  if [ -z "$raw" ] || printf '%s' "$raw" | grep -Eq '(^\-|\.\.|[[:space:]])' || ! printf '%s' "$raw" | grep -Eq '^[a-zA-Z0-9._/-]+$'; then
    err "Ungültiger Branch-Name '$raw'."
    return 1
  fi
  VALIDATED_VALUE="$raw"
  return 0
}

prompt_validated() {
  local target_var="$1"
  local prompt_label="$2"
  local default_val="$3"
  local cli_val="$4"
  local validator_fn="$5"

  if [ -n "$cli_val" ]; then
    if ! "$validator_fn" "$cli_val"; then
      exit 1
    fi
    printf -v "$target_var" '%s' "$VALIDATED_VALUE"
    return 0
  fi

  if [ "$ASSUME_YES" = "1" ]; then
    if ! "$validator_fn" "$default_val"; then
      exit 1
    fi
    printf -v "$target_var" '%s' "$VALIDATED_VALUE"
    return 0
  fi

  local answer=""
  while true; do
    read_input answer "${prompt_label} [${default_val}]: "
    answer="$(trim "$answer")"
    if [ -z "$answer" ]; then
      answer="$default_val"
    fi
    if "$validator_fn" "$answer"; then
      printf -v "$target_var" '%s' "$VALIDATED_VALUE"
      return 0
    fi
  done
}

resolve_validated() {
  local target_var="$1"
  local default_val="$2"
  local cli_val="$3"
  local validator_fn="$4"

  local val="${cli_val:-$default_val}"
  if ! "$validator_fn" "$val"; then
    exit 1
  fi
  printf -v "$target_var" '%s' "$VALIDATED_VALUE"
}

collect_configuration() {
  local default_cores="2"
  if [ -n "$HOST_CPU_CORES" ] && [ "$HOST_CPU_CORES" -lt 2 ]; then
    default_cores="1"
  fi
  local default_rootfs
  default_rootfs="$(pick_default_storage "$ROOTFS_STORAGES" "local-lvm")"
  local default_template_storage
  default_template_storage="$(pick_default_storage "$TEMPLATE_STORAGES" "local")"

  printf '\n============================================================\n'
  printf '  Bike Archiv - Proxmox VE LXC Installation\n'
  printf '============================================================\n'
  if [ -n "$HOST_RAM_MB" ] || [ -n "$HOST_CPU_CORES" ]; then
    printf 'Host-Ressourcen: %s CPU-Kerne | %s MB RAM\n' \
      "${HOST_CPU_CORES:-unbekannt}" "${HOST_RAM_MB:-unbekannt}"
  fi
  printf '\n'

  prompt_validated RAM_MB "Arbeitsspeicher / RAM in MB (oder z. B. 2G)" "$DEFAULT_RAM_MB" "$CLI_RAM" validate_ram_mb
  prompt_validated CPU_CORES "Anzahl CPU-Kerne (vCPUs)" "$default_cores" "$CLI_CORES" validate_cores
  prompt_validated DISK_GB "Festplattengröße in GB (z. B. 8 oder 16G)" "$DEFAULT_DISK_GB" "$CLI_DISK" validate_disk_gb

  resolve_validated CTID "$NEXT_CTID" "$CLI_CTID" validate_ctid
  resolve_validated HOSTNAME "$DEFAULT_HOSTNAME" "$CLI_HOSTNAME" validate_hostname
  resolve_validated APP_PORT "$DEFAULT_APP_PORT" "$CLI_PORT" validate_port
  resolve_validated ROOTFS_STORAGE "$default_rootfs" "$CLI_STORAGE" validate_rootfs_storage
  resolve_validated TEMPLATE_STORAGE "$default_template_storage" "$CLI_TEMPLATE_STORAGE" validate_template_storage
  resolve_validated BRIDGE "$DETECTED_BRIDGE" "$CLI_BRIDGE" validate_bridge
  resolve_validated IP_SPEC "$DEFAULT_IP_SPEC" "$CLI_IP" validate_ip_spec

  GATEWAY=""
  if [ "$IP_SPEC" != "dhcp" ]; then
    local default_gw="${IP_SPEC%/*}"
    default_gw="${default_gw%.*}.1"
    resolve_validated GATEWAY "$default_gw" "$CLI_GATEWAY" validate_gateway
  fi

  resolve_validated REPO_URL "$DEFAULT_REPO_URL" "$CLI_REPO" validate_repo_url
  resolve_validated REPO_BRANCH "$DEFAULT_REPO_BRANCH" "$CLI_BRANCH" validate_branch

  if [ "$RAM_MB" -lt 512 ]; then
    SWAP_MB="$RAM_MB"
  else
    SWAP_MB="512"
  fi

  if [ "$IP_SPEC" = "dhcp" ]; then
    NET0_SPEC="name=eth0,bridge=${BRIDGE},ip=dhcp,type=veth"
  else
    NET0_SPEC="name=eth0,bridge=${BRIDGE},ip=${IP_SPEC},gw=${GATEWAY},type=veth"
  fi
}

print_summary() {
  printf '\n%s\n' '------------------------------------------------------------'
  printf 'Geplante LXC-Konfiguration:\n'
  printf '  Container-ID (CTID): %s\n' "$CTID"
  printf '  Hostname:            %s\n' "$HOSTNAME"
  printf '  Arbeitsspeicher:     %s MB (Swap: %s MB)\n' "$RAM_MB" "$SWAP_MB"
  printf '  CPU-Kerne:           %s\n' "$CPU_CORES"
  printf '  Festplatte:          %s GB auf %s\n' "$DISK_GB" "$ROOTFS_STORAGE"
  printf '  Template-Storage:    %s\n' "$TEMPLATE_STORAGE"
  printf '  Netzwerk (net0):     %s\n' "$NET0_SPEC"
  printf '  Bike-Archiv-Port:    %s\n' "$APP_PORT"
  printf '  Repository:          %s (%s)\n' "$REPO_URL" "$REPO_BRANCH"
  printf '%s\n' '------------------------------------------------------------'
}

resolve_debian_template() {
  local machine_arch
  machine_arch="$(uname -m)"
  local lxc_arch="amd64"
  case "$machine_arch" in
    aarch64|arm64)
      lxc_arch="arm64"
      ;;
    x86_64|amd64)
      lxc_arch="amd64"
      ;;
  esac

  info "Aktualisiere Proxmox-Template-Index..."
  pveam update >/dev/null

  local existing_template
  existing_template="$(
    pveam list "$TEMPLATE_STORAGE" 2>/dev/null \
      | awk '{print $1}' \
      | sed 's|^.*vztmpl/||' \
      | grep -E "^debian-12-standard_.*_${lxc_arch}\.tar\.(zst|gz|xz)$" \
      | sort -V \
      | tail -n 1 || true
  )"

  if [ -n "$existing_template" ]; then
    TEMPLATE_NAME="$existing_template"
    info "Vorhandenes Debian-12-Template gefunden: $TEMPLATE_NAME"
    return 0
  fi

  local available_template
  available_template="$(
    pveam available --section system 2>/dev/null \
      | awk '{print $2}' \
      | grep -E "^debian-12-standard_.*_${lxc_arch}\.tar\.zst$" \
      | sort -V \
      | tail -n 1 || true
  )"

  if [ -z "$available_template" ]; then
    available_template="$(
      pveam available --section system 2>/dev/null \
        | awk '{print $2}' \
        | grep -E "^debian-12-standard_.*" \
        | sort -V \
        | tail -n 1 || true
    )"
  fi

  if [ -z "$available_template" ]; then
    err "Kein Debian-12-LXC-Template über pveam gefunden."
    exit 1
  fi

  info "Lade Debian-12-Template herunter: $available_template -> $TEMPLATE_STORAGE"
  pveam download "$TEMPLATE_STORAGE" "$available_template"
  TEMPLATE_NAME="$available_template"
}

create_and_start_container() {
  info "Erstelle LXC-Container $CTID ($HOSTNAME) mit ${RAM_MB} MB RAM, ${CPU_CORES} CPU-Kernen und ${DISK_GB} GB Festplatte..."
  pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE_NAME}" \
    --hostname "$HOSTNAME" \
    --cores "$CPU_CORES" \
    --memory "$RAM_MB" \
    --swap "$SWAP_MB" \
    --rootfs "${ROOTFS_STORAGE}:${DISK_GB}" \
    --net0 "$NET0_SPEC" \
    --ostype debian \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --start 1

  CT_CREATED="1"
  CREATED_CTID="$CTID"

  local status_line
  status_line="$(pct status "$CTID" 2>/dev/null || true)"
  if ! printf '%s' "$status_line" | grep -q 'running'; then
    info "Starte Container $CTID..."
    pct start "$CTID"
  fi
}

provision_container() {
  info "Richte Bike Archiv im Container $CTID ein (Node.js 22, Build, systemd)..."
  pct exec "$CTID" -- bash -euo pipefail -s -- "$REPO_URL" "$REPO_BRANCH" "$APP_PORT" <<'CONTAINER_EOF'
REPO_URL="$1"
REPO_BRANCH="$2"
APP_PORT="$3"

export DEBIAN_FRONTEND=noninteractive

wait_for_network() {
  local attempt=0
  while [ "$attempt" -lt 45 ]; do
    if getent hosts deb.debian.org >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  echo "Netzwerk/DNS im Container nicht rechtzeitig bereit." >&2
  return 1
}

wait_for_network

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg git sqlite3

mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main\n' \
  > /etc/apt/sources.list.d/nodesource.list

apt-get update
apt-get install -y --no-install-recommends nodejs

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Installierte Node.js-Version ist zu alt: $(node -v)" >&2
  exit 1
fi

if ! id -u bike-archiv >/dev/null 2>&1; then
  useradd --system --home-dir /opt/bike-archiv --shell /usr/sbin/nologin bike-archiv
fi

mkdir -p /var/lib/bike-archiv /var/lib/bike-archiv/uploads /var/lib/bike-archiv/backups /etc/bike-archiv
chown -R bike-archiv:bike-archiv /var/lib/bike-archiv
chmod 750 /var/lib/bike-archiv

cat > /etc/bike-archiv/bike-archiv.env <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=${APP_PORT}
DB_PATH=/var/lib/bike-archiv/bike-archiv.sqlite
UPLOADS_DIR=/var/lib/bike-archiv/uploads
SERVE_STATIC=true
EOF
chown root:bike-archiv /etc/bike-archiv/bike-archiv.env
chmod 640 /etc/bike-archiv/bike-archiv.env

rm -rf /opt/bike-archiv
git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" /opt/bike-archiv
cd /opt/bike-archiv
npm ci
npm run build
npm prune --omit=dev
chown -R bike-archiv:bike-archiv /opt/bike-archiv

CAP_LINES=""
if [ "$APP_PORT" -lt 1024 ]; then
  CAP_LINES=$'AmbientCapabilities=CAP_NET_BIND_SERVICE\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE'
fi

cat > /etc/systemd/system/bike-archiv.service <<EOF
[Unit]
Description=Bike Archiv Webserver
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=bike-archiv
Group=bike-archiv
WorkingDirectory=/opt/bike-archiv
EnvironmentFile=/etc/bike-archiv/bike-archiv.env
ExecStart=/usr/bin/node /opt/bike-archiv/server/index.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/bike-archiv
${CAP_LINES}

[Install]
WantedBy=multi-user.target
EOF

cat > /usr/local/bin/bike-archiv-update <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/bike-archiv
if [ -x /opt/bike-archiv/deploy/proxmox/update.sh ]; then
  exec /opt/bike-archiv/deploy/proxmox/update.sh "$@"
fi
git pull --ff-only
npm ci
npm run build
npm prune --omit=dev
chown -R bike-archiv:bike-archiv /opt/bike-archiv
systemctl restart bike-archiv
. /etc/bike-archiv/bike-archiv.env
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null
echo "Bike Archiv erfolgreich aktualisiert."
EOF
chmod 755 /usr/local/bin/bike-archiv-update

systemctl daemon-reload
systemctl enable --now bike-archiv.service

health_ok=0
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  sleep 1
done

if [ "$health_ok" -ne 1 ]; then
  journalctl -u bike-archiv -n 30 --no-pager >&2 || true
  echo "Health-Check unter http://127.0.0.1:${APP_PORT}/api/health fehlgeschlagen." >&2
  exit 1
fi
CONTAINER_EOF
}

print_completion_info() {
  local ct_ips=""
  ct_ips="$(pct exec "$CTID" -- hostname -I 2>/dev/null | tr -s ' ' | sed 's/^ *//;s/ *$//' || true)"
  local primary_ip=""
  primary_ip="$(printf '%s' "$ct_ips" | awk '{print $1}')"
  if [ -z "$primary_ip" ] && [ "$IP_SPEC" != "dhcp" ]; then
    primary_ip="${IP_SPEC%/*}"
  fi

  local pct_cfg=""
  pct_cfg="$(pct config "$CTID" 2>/dev/null || true)"
  local cfg_mem
  cfg_mem="$(printf '%s\n' "$pct_cfg" | awk -F': ' '/^memory:/ {print $2}' | tr -d '[:space:]')"
  local cfg_cores
  cfg_cores="$(printf '%s\n' "$pct_cfg" | awk -F': ' '/^cores:/ {print $2}' | tr -d '[:space:]')"

  printf '\n============================================================\n'
  printf '  Bike Archiv Installation abgeschlossen\n'
  printf '============================================================\n'
  printf '  Container-ID:     %s (%s)\n' "$CTID" "$HOSTNAME"
  printf '  Zugewiesener RAM: %s MB\n' "${cfg_mem:-$RAM_MB}"
  printf '  Zugewiesene CPUs: %s Kerne\n' "${cfg_cores:-$CPU_CORES}"
  printf '  Festplatte:       %s GB (%s)\n' "$DISK_GB" "$ROOTFS_STORAGE"
  printf '  SQLite-Datenbank: /var/lib/bike-archiv/bike-archiv.sqlite (im CT)\n'
  if [ -n "$primary_ip" ]; then
    printf '  Weboberfläche:    http://%s:%s\n' "$primary_ip" "$APP_PORT"
  else
    printf '  Weboberfläche:    Port %s (IP per "pct exec %s -- hostname -I" prüfen)\n' "$APP_PORT" "$CTID"
  fi
  printf '\nNützliche Befehle auf dem Proxmox-Host:\n'
  printf '  Status:  pct exec %s -- systemctl status bike-archiv\n' "$CTID"
  printf '  Logs:    pct exec %s -- journalctl -u bike-archiv -f\n' "$CTID"
  printf '  Update:  pct exec %s -- bike-archiv-update\n' "$CTID"
  printf '============================================================\n'
}

main() {
  parse_args "$@"
  check_root
  require_proxmox_tools
  detect_host_resources
  collect_configuration
  print_summary

  if [ "$DRY_RUN" = "1" ]; then
    info "Dry-Run aktiv. Es werden keine Änderungen vorgenommen."
    printf 'Geplanter Befehl:\n'
    printf 'pct create %s %s:vztmpl/<debian-12-template> --hostname %s --cores %s --memory %s --swap %s --rootfs %s:%s --net0 %s --ostype debian --unprivileged 1 --features nesting=1 --onboot 1 --start 1\n' \
      "$CTID" "$TEMPLATE_STORAGE" "$HOSTNAME" "$CPU_CORES" "$RAM_MB" "$SWAP_MB" "$ROOTFS_STORAGE" "$DISK_GB" "$NET0_SPEC"
    exit 0
  fi

  resolve_debian_template
  create_and_start_container
  provision_container
  print_completion_info
}

main "$@"
