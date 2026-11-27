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
  assert.match(help.stdout, /--disk/);
  assert.match(help.stdout, /--dry-run/);
});

test('Proxmox-Installer fragt nur RAM, CPUs und Festplatte interaktiv ab und setzt den Rest automatisch', () => {
  const mock = createMockProxmoxEnv();
  try {
    const answers = [
      '2048', // RAM in MB
      '4',    // CPU-Kerne
      '16',   // Festplatte in GB
    ].join('\n') + '\n';

    const res = runInstaller([], { input: answers, binDir: mock.binDir });
    assert.equal(res.status, 0, res.stderr);

    assert.doesNotMatch(res.stdout, /Container-ID \(CTID\) \[/);
    assert.doesNotMatch(res.stdout, /Hostname \[/);
    assert.doesNotMatch(res.stdout, /Server-Port \[/);
    assert.doesNotMatch(res.stdout, /Rootfs-Storage \[/);
    assert.doesNotMatch(res.stdout, /Template-Storage \[/);
    assert.doesNotMatch(res.stdout, /Netzwerk-Bridge \[/);
    assert.doesNotMatch(res.stdout, /IP-Konfiguration/);
    assert.doesNotMatch(res.stdout, /Installation mit diesen Einstellungen starten/);

    const log = fs.readFileSync(mock.logFile, 'utf8');
    assert.match(
      log,
      /pct create 105 local:vztmpl\/debian-12-standard_12\.7-1_(amd64|arm64)\.tar\.zst --hostname bike-archiv --cores 4 --memory 2048 --swap 512 --rootfs local-lvm:16 --net0 name=eth0,bridge=vmbr0,ip=dhcp,type=veth --ostype debian --unprivileged 1 --features nesting=1 --onboot 1 --start 1/,
    );
    assert.match(log, /pct exec 105 -- bash -euo pipefail/);
    assert.match(res.stdout, /Zugewiesener RAM:\s+2048 MB/);
    assert.match(res.stdout, /Zugewiesene CPUs:\s+4 Kerne/);
    assert.match(res.stdout, /Festplatte:\s+16 GB/);
  } finally {
    mock.cleanup();
  }
});

test('Proxmox-Installer akzeptiert GB-Notation (3G, 12G) und wiederholt bei ungültigen Eingaben', () => {
  const mock = createMockProxmoxEnv();
  try {
    const answers = [
      'abc',  // ungültiges RAM
      '256',  // zu wenig RAM (< 512)
      '3G',   // gültig -> 3072 MB
      '0',    // ungültige CPU-Anzahl
      '99',   // mehr als Host-CPUs (8)
      '2',    // gültig -> 2 Kerne
      'abc',  // ungültige Festplattengröße
      '2',    // zu klein (< 4 GB)
      '12G',  // gültig -> 12 GB
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
    assert.match(res.stderr, /Festplattengröße muss/);

    const log = fs.readFileSync(mock.logFile, 'utf8');
    assert.match(log, /pveam download local debian-12-standard_12\.7-1_(amd64|arm64)\.tar\.zst/);
    assert.match(
      log,
      /pct create 105 .* --hostname bike-archiv --cores 2 --memory 3072 --swap 512 --rootfs local-lvm:12/,
    );
  } finally {
    mock.cleanup();
  }
});

test('Proxmox-Installer übernimmt optionale CLI-Overrides für automatische Parameter', () => {
  const mock = createMockProxmoxEnv();
  try {
    const answers = [
      '1024',
      '2',
      '10',
    ].join('\n') + '\n';

    const res = runInstaller(
      [
        '--ctid', '110',
        '--hostname', 'bike-box',
        '--storage', 'local-zfs',
        '--port', '3005',
        '--ip', '192.168.10.50/24',
        '--gateway', '192.168.10.1',
      ],
      { input: answers, binDir: mock.binDir },
    );
    assert.equal(res.status, 0, res.stderr);

    const log = fs.readFileSync(mock.logFile, 'utf8');
    assert.match(
      log,
      /pct create 110 .* --hostname bike-box --cores 2 --memory 1024 --swap 512 --rootfs local-zfs:10 --net0 name=eth0,bridge=vmbr0,ip=192\.168\.10\.50\/24,gw=192\.168\.10\.1,type=veth/,
    );
  } finally {
    mock.cleanup();
  }
});

test('Proxmox-Installer unterstützt --dry-run und --yes ohne Container anzulegen', () => {
  const mock = createMockProxmoxEnv();
  try {
    const res = runInstaller(
      ['--ram', '4G', '--cores', '3', '--disk', '20', '--ctid', '210', '--yes', '--dry-run'],
      { binDir: mock.binDir },
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /--cores 3 --memory 4096/);
    assert.match(res.stdout, /--rootfs local-lvm:20/);
    assert.match(res.stdout, /Dry-Run aktiv/);

    const log = fs.existsSync(mock.logFile) ? fs.readFileSync(mock.logFile, 'utf8') : '';
    assert.doesNotMatch(log, /pct create/);
  } finally {
    mock.cleanup();
  }
});

test('Proxmox-Updater (update.sh) besteht bash -n, --help, --dry-run und sichert SQLite vor Update', () => {
  const updaterPath = path.join(repoRoot, 'deploy', 'proxmox', 'update.sh');
  const syntax = spawnSync('bash', ['-n', updaterPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);

  const help = spawnSync('bash', [updaterPath, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--branch/);
  assert.match(help.stdout, /--check/);
  assert.match(help.stdout, /--dry-run/);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bike-archiv-upd-'));
  try {
    const appDir = path.join(tmpDir, 'app');
    const binDir = path.join(tmpDir, 'bin');
    const dbFile = path.join(tmpDir, 'bike-archiv.sqlite');
    fs.mkdirSync(path.join(appDir, '.git'), { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(dbFile, 'SQLite mock content', 'utf8');

    const logFile = path.join(tmpDir, 'upd.log');
    const writeFake = (name, body) => {
      fs.writeFileSync(path.join(binDir, name), `#!/usr/bin/env bash\n${body}`, {
        mode: 0o755,
      });
    };

    writeFake(
      'git',
      `
echo "git $*" >> "${logFile}"
if printf '%s' "$*" | grep -q 'rev-parse --abbrev-ref HEAD'; then
  echo "main"
elif printf '%s' "$*" | grep -q 'rev-parse origin/main'; then
  echo "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
elif printf '%s' "$*" | grep -q 'rev-parse HEAD'; then
  echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
fi
`,
    );
    writeFake('npm', `echo "npm $*" >> "${logFile}"`);
    writeFake(
      'sqlite3',
      `
echo "sqlite3 $*" >> "${logFile}"
dest="$(printf '%s' "$2" | sed -n "s/^\\.backup '\\(.*\\)'$/\\1/p")"
cp "$1" "$dest"
`,
    );

    const dryRun = spawnSync('bash', [updaterPath, '--dry-run'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH || ''}`,
        BIKE_ARCHIV_APP_DIR: appDir,
        BIKE_ARCHIV_DB_PATH: dbFile,
        BIKE_ARCHIV_ENV_FILE: path.join(tmpDir, 'missing.env'),
      },
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Dry-Run aktiv/);

    const updateRun = spawnSync('bash', [updaterPath, '--no-restart'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH || ''}`,
        BIKE_ARCHIV_APP_DIR: appDir,
        BIKE_ARCHIV_DB_PATH: dbFile,
        BIKE_ARCHIV_ENV_FILE: path.join(tmpDir, 'missing.env'),
      },
    });
    assert.equal(updateRun.status, 0, updateRun.stderr);
    assert.match(updateRun.stdout, /Vorab-Backup erstellt/);
    assert.match(updateRun.stdout, /erfolgreich aktualisiert/);

    const backupsDir = path.join(tmpDir, 'backups');
    const backups = fs.readdirSync(backupsDir);
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^bike-archiv-pre-update-.*\.sqlite$/);

    const log = fs.readFileSync(logFile, 'utf8');
    assert.match(log, /git -C .* pull --ff-only origin main/);
    assert.match(log, /npm ci/);
    assert.match(log, /npm run build/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
