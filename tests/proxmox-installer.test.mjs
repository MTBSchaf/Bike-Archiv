import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const installerPath = path.join(repoRoot, 'deploy', 'proxmox', 'install.sh');

function createMockProxmoxEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-archiv-pve-'));
  const binDir = path.join(tmpDir, 'bin');
  const logFile = path.join(tmpDir, 'calls.log');
  const stateDir = path.join(tmpDir, 'state');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const writeFakeBin = (name, script) => {
    const filePath = path.join(binDir, name);
    fs.writeFileSync(filePath, `#!/usr/bin/env bash\n${script}`, { mode: 0o755 });
  };

  writeFakeBin(
    'pct',
    `
set -euo pipefail
subcmd="\${1:-}"
shift || true
case "$subcmd" in
  status)
    ctid="\${1:-}"
    if [ -f "${stateDir}/ct_\${ctid}" ]; then
      echo "status: running"
      exit 0
    fi
    exit 1
    ;;
  create)
    echo "pct create $*" >> "${logFile}"
    ctid="\${1:-}"
    touch "${stateDir}/ct_\${ctid}"
    printf '%s\\n' "$*" > "${stateDir}/args_\${ctid}"
    ;;
  start)
    echo "pct start $*" >> "${logFile}"
    ;;
  exec)
    echo "pct exec $*" >> "${logFile}"
    if printf '%s' "$*" | grep -q 'hostname -I'; then
      echo "192.168.178.42"
    elif printf '%s' "$*" | grep -q -- '-- bash'; then
      cat >/dev/null
    fi
    ;;
  config)
    ctid="\${1:-}"
    args="$(cat "${stateDir}/args_\${ctid}" 2>/dev/null || true)"
    mem="$(printf '%s' "$args" | sed -n 's/.*--memory \\([0-9]*\\).*/\\1/p')"
    cores="$(printf '%s' "$args" | sed -n 's/.*--cores \\([0-9]*\\).*/\\1/p')"
    echo "memory: \${mem:-1024}"
    echo "cores: \${cores:-2}"
    ;;
  *)
    echo "pct $subcmd $*" >> "${logFile}"
    ;;
esac
`,
  );

  writeFakeBin(
    'pvesm',
    `
echo "pvesm $*" >> "${logFile}"
if printf '%s' "$*" | grep -q 'rootdir'; then
  cat <<'EOF'
Name         Type     Status           Total            Used       Available        %
local-lvm    lvmthin  active       100000000        20000000        80000000   20.00%
local-zfs    zfspool  active       100000000        10000000        90000000   10.00%
EOF
else
  cat <<'EOF'
Name         Type     Status           Total            Used       Available        %
local        dir      active        50000000        10000000        40000000   20.00%
EOF
fi
`,
  );

  writeFakeBin(
    'pveam',
    `
subcmd="\${1:-}"
shift || true
echo "pveam $subcmd $*" >> "${logFile}"
case "$subcmd" in
  update)
    exit 0
    ;;
  list)
    if [ "\${MOCK_NO_LOCAL_TEMPLATE:-0}" = "1" ]; then
      exit 0
    fi
    echo "local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst 120MB"
    echo "local:vztmpl/debian-12-standard_12.7-1_arm64.tar.zst 118MB"
    ;;
  available)
    echo "system          debian-12-standard_12.7-1_amd64.tar.zst"
    echo "system          debian-12-standard_12.7-1_arm64.tar.zst"
    ;;
  download)
    exit 0
    ;;
esac
`,
  );

  writeFakeBin(
    'pvesh',
    `
echo "pvesh $*" >> "${logFile}"
echo "105"
`,
  );

  writeFakeBin(
    'nproc',
    `
echo "8"
`,
  );

  writeFakeBin(
    'free',
    `
cat <<'EOF'
               total        used        free      shared  buff/cache   available
Mem:           16384        4096       10240         128        2048       12000
Swap:           2048           0        2048
EOF
`,
  );

  return {
    tmpDir,
    binDir,
    logFile,
    cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

function runInstaller(args, { input = '', envOverrides = {}, binDir }) {
  const result = spawnSync('bash', [installerPath, ...args], {
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH || ''}`,
      BIKE_ARCHIV_SKIP_ROOT_CHECK: '1',
      BIKE_ARCHIV_PROMPT_INPUT: 'stdin',
      ...envOverrides,
    },
  });
  return result;
}

test('Proxmox-Installer besteht bash -n Syntaxprüfung und zeigt --help', () => {
  const syntax = spawnSync('bash', ['-n', installerPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  const help = spawnSync('bash', [installerPath, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--ram/);
  assert.match(help.stdout, /--cores/);
  assert.match(help.stdout, /--dry-run/);
});

test('Proxmox-Installer fragt RAM und CPUs interaktiv ab und übergibt exakte Werte an pct create', () => {
  const mock = createMockProxmoxEnv();
  try {
    const answers = [
      '2048', // RAM in MB
      '4',    // CPU-Kerne
      '',     // CTID (Default 105)
      '',     // Hostname (Default bike-archiv)
      '',     // Disk (Default 8)
      '',     // Port (Default 3001)
      '',     // Rootfs-Storage (Default local-lvm)
      '',     // Template-Storage (Default local)
      '',     // Bridge (Default vmbr0)
      '',     // IP (Default dhcp)
      'j',    // Bestätigung
    ].join('\n') + '\n';

    const res = runInstaller([], { input: answers, binDir: mock.binDir });
    assert.equal(res.status, 0, res.stderr);

    const log = fs.readFileSync(mock.logFile, 'utf8');
    assert.match(
      log,
      /pct create 105 local:vztmpl\/debian-12-standard_12\.7-1_(amd64|arm64)\.tar\.zst --hostname bike-archiv --cores 4 --memory 2048 --swap 512 --rootfs local-lvm:8 --net0 name=eth0,bridge=vmbr0,ip=dhcp,type=veth --ostype debian --unprivileged 1 --features nesting=1 --onboot 1 --start 1/,
    );
    assert.match(log, /pct exec 105 -- bash -euo pipefail/);
    assert.match(res.stdout, /Zugewiesener RAM:\s+2048 MB/);
    assert.match(res.stdout, /Zugewiesene CPUs:\s+4 Kerne/);
  } finally {
    mock.cleanup();
  }
});

test('Proxmox-Installer akzeptiert GB-Notation (3G -> 3072 MB) und wiederholt bei ungültigen Eingaben', () => {
  const mock = createMockProxmoxEnv();
  try {
    const answers = [
      'abc',  // ungültiges RAM
      '256',  // zu wenig RAM (< 512)
      '3G',   // gültig -> 3072 MB
      '0',    // ungültige CPU-Anzahl
      '99',   // mehr als Host-CPUs (8)
      '2',    // gültig -> 2 Kerne
      '106',  // CTID
      'bike-box', // Hostname
      '12',   // Disk GB
      '3005', // Port
      'local-zfs', // Rootfs
      'local',     // Template
      'vmbr0',     // Bridge
      'dhcp',      // IP
      'y',         // Bestätigung
    ].join('\n') + '\n';

    const res = runInstaller([], {
      input: answers,
      binDir: mock.binDir,
      envOverrides: { MOCK_NO_LOCAL_TEMPLATE: '1' },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stderr, /Ungültige RAM-Angabe/);
    assert.match(res.stderr, /Mindestens 512 MB RAM/);
    assert.match(res.stderr, /Mindestens 1 CPU-Kern/);
    assert.match(res.stderr, /Maximal 8 CPU-Kerne/);

    const log = fs.readFileSync(mock.logFile, 'utf8');
    assert.match(log, /pveam download local debian-12-standard_12\.7-1_(amd64|arm64)\.tar\.zst/);
    assert.match(
      log,
      /pct create 106 .* --hostname bike-box --cores 2 --memory 3072 --swap 512 --rootfs local-zfs:12/,
    );
  } finally {
    mock.cleanup();
  }
});

test('Proxmox-Installer übernimmt statische IP und Gateway korrekt in net0', () => {
  const mock = createMockProxmoxEnv();
  try {
    const answers = [
      '1024',
      '2',
      '110',
      'bike-archiv',
      '8',
      '3001',
      'local-lvm',
      'local',
      'vmbr0',
      '192.168.10.50/24',
      '192.168.10.1',
      'j',
    ].join('\n') + '\n';

    const res = runInstaller([], { input: answers, binDir: mock.binDir });
    assert.equal(res.status, 0, res.stderr);

    const log = fs.readFileSync(mock.logFile, 'utf8');
    assert.match(
      log,
      /--net0 name=eth0,bridge=vmbr0,ip=192\.168\.10\.50\/24,gw=192\.168\.10\.1,type=veth/,
    );
  } finally {
    mock.cleanup();
  }
});

test('Proxmox-Installer unterstützt --dry-run und --yes ohne Container anzulegen', () => {
  const mock = createMockProxmoxEnv();
  try {
    const res = runInstaller(
      ['--ram', '4G', '--cores', '3', '--ctid', '210', '--yes', '--dry-run'],
      { binDir: mock.binDir },
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /--cores 3 --memory 4096/);
    assert.match(res.stdout, /Dry-Run aktiv/);

    const log = fs.existsSync(mock.logFile) ? fs.readFileSync(mock.logFile, 'utf8') : '';
    assert.doesNotMatch(log, /pct create/);
  } finally {
    mock.cleanup();
  }
});
