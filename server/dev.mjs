import { spawn } from 'node:child_process';

const serverProc = spawn(process.execPath, ['server/index.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
});

const viteBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const clientProc = spawn(viteBin, ['vite'], {
  stdio: 'inherit',
  env: process.env,
});

function shutdown(signal) {
  serverProc.kill(signal);
  clientProc.kill(signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

serverProc.on('exit', (code) => {
  clientProc.kill('SIGTERM');
  process.exit(code ?? 0);
});

clientProc.on('exit', (code) => {
  serverProc.kill('SIGTERM');
  process.exit(code ?? 0);
});
