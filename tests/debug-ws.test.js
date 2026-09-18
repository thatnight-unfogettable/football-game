// 调试 ws 连接和消息
import { WebSocket } from 'ws';
const URL = 'ws://localhost:3100/ws';

function mk(name) {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.on('open', () => console.log(`[${name}] OPEN`));
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); msgs.push(m); console.log(`[${name}] MSG ${m.type} payload=${JSON.stringify(m.payload||m).slice(0,120)}`); });
  ws.on('error', e => console.error(`[${name}] ERR:`, e.message));
  ws.on('close', (code, buf) => console.log(`[${name}] CLOSE code=${code}`));
  return {
    ws, msgs,
    send(type, payload = {}) { this.ws.send(JSON.stringify({ type, payload, protocol: 3 })); },
    state() { const arr = this.msgs.filter(m => m.type === 'STATE'); return arr.length ? arr[arr.length - 1].payload : null; },
  };
}

function waitOpen(c) {
  return new Promise((res) => {
    if (c.ws.readyState === 1) return res();
    c.ws.once('open', res);
  });
}

async function main() {
  const A = mk('A'), B = mk('B');
  await new Promise(r => setTimeout(r, 500));
  await waitOpen(A); await waitOpen(B);
  A.send('CREATE', { nickname: 'Alice' });
  await new Promise(r => setTimeout(r, 500));
  const s = A.msgs.find(m => m.type === 'SESSION');
  console.log('SESSION:', s?.payload);
  const code = s?.payload?.code;
  if (!code) { console.error('CREATE failed'); process.exit(1); }
  B.send('JOIN', { code, nickname: 'Bob' });
  await new Promise(r => setTimeout(r, 500));
  const s2 = B.msgs.find(m => m.type === 'SESSION');
  console.log('JOIN SESSION:', s2?.payload);
  A.send('READY', { ready: true });
  B.send('READY', { ready: true });
  await new Promise(r => setTimeout(r, 4500));
  const st = A.state();
  console.log('After READY status:', st?.status, 'phase:', st?.game?.phase);
  if (st?.status !== 'playing') { console.error('开局失败'); process.exit(1); }
  const owner = A.state().choiceOwner;
  console.log('choiceOwner=', owner);
  (owner === 'A' ? A : B).send('ORDER', { choice: 'first' });
  await new Promise(r => setTimeout(r, 500));
  console.log('After ORDER A phase:', A.state().game?.phase);
  console.log('After ORDER B phase:', B.state().game?.phase);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
