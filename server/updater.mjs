import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function readPackageVersion(rootDir) {
  try {
    const pkgRaw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function runGitSync(rootDir, args) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function sanitizeRemoteUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return rawUrl.replace(/\/\/[^@/]+@/g, '//');
  }
}

export function getGitInfo(rootDir) {
  const commit = runGitSync(rootDir, ['rev-parse', '--short', 'HEAD']);
  const fullCommit = runGitSync(rootDir, ['rev-parse', 'HEAD']);
  const branch = runGitSync(rootDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const remoteUrl = sanitizeRemoteUrl(runGitSync(rootDir, ['remote', 'get-url', 'origin']));
  return {
    available: Boolean(fullCommit),
    commit: commit || '',
    fullCommit: fullCommit || '',
    branch: branch && branch !== 'HEAD' ? branch : 'main',
    remoteUrl,
  };
}

export function getAppVersion(rootDir) {
  return readPackageVersion(rootDir);
}

export async function checkRemoteUpdate({ rootDir }) {
  const git = getGitInfo(rootDir);
  const checkedAt = new Date().toISOString();
  const currentVersion = readPackageVersion(rootDir);

  if (!git.available || !git.remoteUrl) {
    return {
      checkedAt,
      currentVersion,
      branch: git.branch,
      currentCommit: git.commit || null,
      latestCommit: null,
      upToDate: true,
      updateAvailable: false,
      offline: true,
      message: 'Kein Git-Remote konfiguriert. Updates können als Update-Paket (.json) oder über bike-archiv-update eingespielt werden.',
      updateCommand: 'bike-archiv-update',
    };
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-remote', 'origin', `refs/heads/${git.branch}`],
      { cwd: rootDir, timeout: 5000, encoding: 'utf8' },
    );
    const firstLine = stdout.trim().split('\n')[0] || '';
    const latestFull = firstLine.split(/\s+/)[0] || '';
    if (!latestFull) {
      return {
        checkedAt,
        currentVersion,
        branch: git.branch,
        currentCommit: git.commit,
        latestCommit: null,
        upToDate: true,
        updateAvailable: false,
        offline: true,
        message: `Remote-Branch „${git.branch}“ konnte nicht abgefragt werden.`,
        updateCommand: 'bike-archiv-update',
      };
    }

    const latestCommit = latestFull.slice(0, 7);
    const updateAvailable = Boolean(git.fullCommit && latestFull !== git.fullCommit);

    return {
      checkedAt,
      currentVersion,
      branch: git.branch,
      currentCommit: git.commit,
      latestCommit,
      upToDate: !updateAvailable,
      updateAvailable,
      offline: false,
      message: updateAvailable
        ? `Neuer Stand verfügbar (${git.commit} → ${latestCommit} auf ${git.branch}).`
        : `Anwendung ist aktuell (${git.commit} auf ${git.branch}).`,
      updateCommand: 'bike-archiv-update',
    };
  } catch {
    return {
      checkedAt,
      currentVersion,
      branch: git.branch,
      currentCommit: git.commit || null,
      latestCommit: null,
      upToDate: true,
      updateAvailable: false,
      offline: true,
      message: 'Remote-Abfrage derzeit nicht erreichbar (Offline oder fehlende Netzwerkfreigabe).',
      updateCommand: 'bike-archiv-update',
    };
  }
}
