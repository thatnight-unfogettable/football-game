import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 随机端口，避开 3100（connect-fail 测试要求该端口无服务）
const PORT = 32000 + Math.floor(Math.random() * 8000);
const WATCHDOG_MS = 8 * 60 * 1000;

function waitForPort(port, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = net.connect({ host: '127.0.0.1', port });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`server did not start within ${timeoutMs}ms (port ${port})`));
        else setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });
}

const server = spawn(process.execPath, [path.join(root, 'server', 'server.js')], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

let code = 1;
try {
  await waitForPort(PORT);
  const testFiles = readdirSync(path.join(root, 'tests'))
    .filter((f) => f.endsWith('.test.js') && f !== 'run-tests.test.js')
    .map((f) => path.join(root, 'tests', f));
  code = await new Promise((resolve) => {
    const tests = spawn(process.execPath, [
      '--test',
      '--test-concurrency=1',
      '--test-force-exit',
      ...testFiles,
    ], {
      cwd: root,
      env: { ...process.env, TEST_WS_URL: `ws://127.0.0.1:${PORT}/ws` },
      stdio: 'inherit',
    });
    const watchdog = setTimeout(() => {
      console.error(`[run-tests] watchdog: test runner exceeded ${WATCHDOG_MS}ms, killing it`);
      tests.kill('SIGKILL');
      resolve(1);
    }, WATCHDOG_MS);
    tests.on('error', (err) => {
      clearTimeout(watchdog);
      console.error('[run-tests] failed to start test runner:', err.message);
      resolve(1);
    });
    tests.on('exit', (c) => {
      clearTimeout(watchdog);
      resolve(c ?? 1);
    });
  });
} catch (err) {
  console.error('[run-tests]', err.message);
  console.error(serverLog);
} finally {
  server.kill();
}
process.exit(code);
