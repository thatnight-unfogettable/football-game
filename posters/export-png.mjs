// 用 Edge headless + CDP 截取每张海报为 PNG
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceHtml = resolve(__dirname, 'posters.html');
const workDir = resolve(__dirname, '.render-tmp');
const outDir = resolve(__dirname, 'png');
const userDataDir = resolve(__dirname, '.edge-profile');

await mkdir(outDir, { recursive: true });
await rm(workDir, { recursive: true, force: true });
await rm(userDataDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });

const edgePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => existsSync(p));
if (!edgePath) { console.error('[ERROR] Edge not found'); process.exit(1); }

const template = await readFile(sourceHtml, 'utf8');

function buildSingleHtml(selector) {
  const inject = `
<style>
  html,body{margin:0!important;padding:0!important;background:#000!important;overflow:hidden!important;height:1660px!important;width:1242px!important}
  body{display:block!important;gap:0!important}
  .grid{display:block!important;gap:0!important;max-width:none!important;width:auto!important}
  .label{display:none!important}
  .poster{display:none!important;margin:0!important}
  .poster${selector.replace('.poster','')}{display:block!important;margin:0!important;box-shadow:none!important;position:relative!important;width:1242px!important;height:1660px!important;min-height:1660px!important;max-height:none!important;overflow:hidden!important}
</style>
`;
  return template.replace('</head>', inject + '</head>');
}

const posters = [
  { sel: '.poster.p1', name: '01-cover-kv' },
  { sel: '.poster.p2', name: '02-how-to-play' },
  { sel: '.poster.p3', name: '03-player-pool' },
  { sel: '.poster.p4', name: '04-lineup-433' },
  { sel: '.poster.p5', name: '05-player-say' },
];

console.log(`[INFO] Edge: ${edgePath}`);

// 写临时 HTML
for (const p of posters) {
  await writeFile(resolve(workDir, `${p.name}.html`), buildSingleHtml(p.sel), 'utf8');
}

// 启动 Edge 调试模式
const port = 9222;
const edgeProc = spawn(edgePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--disable-extensions',
  `--user-data-dir=${userDataDir}`,
  `--remote-debugging-port=${port}`,
  '--window-size=1242,1660',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
edgeProc.stderr.on('data', () => {});

async function waitForCDP() {
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('CDP did not become ready');
}

const info = await waitForCDP();
console.log(`[INFO] CDP: ${info.Browser}`);

const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let msgId = 0;
const inflight = new Map();
ws.on('message', (data) => {
  const m = JSON.parse(data.toString());
  if (m.id != null && inflight.has(m.id)) {
    const { resolve, reject } = inflight.get(m.id);
    inflight.delete(m.id);
    if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
  }
});

function send(method, params, sessionId) {
  const id = ++msgId;
  const payload = { id, method, params: params || {} };
  if (sessionId) payload.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    inflight.set(id, { resolve, reject });
    ws.send(JSON.stringify(payload));
  });
}

for (const p of posters) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);

  const fileUrl = `file:///${resolve(workDir, `${p.name}.html`).replace(/\\/g, '/')}`;
  await send('Page.navigate', { url: fileUrl }, sessionId);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    const { result } = await send('Runtime.evaluate', {
      expression: 'document.readyState'
    }, sessionId);
    if (result.value === 'complete') break;
  }
  await new Promise(r => setTimeout(r, 1000));

  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 1242, height: 1660, scale: 1 }
  }, sessionId);

  const outPath = resolve(outDir, `${p.name}.png`);
  await writeFile(outPath, Buffer.from(data, 'base64'));
  console.log(`[OK] ${p.name}.png (${(statSync(outPath).size / 1024).toFixed(0)} KB)`);

  await send('Target.closeTarget', { targetId });
}

ws.close();
try { edgeProc.kill('SIGTERM'); } catch {}
await rm(workDir, { recursive: true, force: true });
console.log('[DONE]');