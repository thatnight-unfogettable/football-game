// 端到端测试：模拟两人完整对战，跨 4 轮，验证不再卡在三选轮的 PICK 阶段。
// 修复前：activeSide 对 taken>=2 永远返回对家，先手方第二次点击被服务端拒绝，
// 三选轮永远走不到 ROUND_END。
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const URL = process.env.TEST_WS_URL || 'ws://localhost:3100/ws';

function mk() {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.on('message', raw => msgs.push(JSON.parse(raw.toString())));
  return {
    ws, msgs,
    send(type, payload = {}) { this.ws.send(JSON.stringify({ type, payload, protocol: 4 })); },
    state() { const arr = this.msgs.filter(m => m.type === 'STATE'); return arr.length ? arr[arr.length - 1].payload : null; },
    wait(type, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          const idx = this.msgs.findIndex(m => m.type === type);
          if (idx >= 0) return resolve(this.msgs.splice(idx, 1)[0]);
          if (Date.now() - started > timeout) return reject(new Error(`Timeout waiting ${type}`));
          setTimeout(poll, 20);
        };
        poll();
      });
    },
    waitNewState(prevCount, timeout = 3000) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          const arr = this.msgs.filter(m => m.type === 'STATE');
          if (arr.length > prevCount) return resolve(arr[arr.length - 1]);
          if (Date.now() - started > timeout) return reject(new Error('Timeout waiting new STATE'));
          setTimeout(poll, 20);
        };
        poll();
      });
    },
  };
}

function pickFromAvailable(state) {
  const removed = new Set([
    ...(state.game.roundBans || []).map(x => x.id),
    ...(state.game.prePicks || []),
    ...(state.game.postPicks || []),
  ]);
  const avail = (state.game.candidates || []).filter(id => !removed.has(id));
  return avail[0];
}

async function playRound(A, B, roundIdx) {
  const owner = A.state().choiceOwner;
  const ownerClient = owner === 'A' ? A : B;
  ownerClient.send('ORDER', { choice: 'first' });
  await new Promise(r => setTimeout(r, 350));
  const phase = A.state().game.phase;
  const roundType = A.state().game.roundType;

  if (phase === 'PRE_PICK') {
    for (let i = 0; i < 2; i++) {
      const side = A.state().game.activeSide;
      const c = side === 'A' ? A : B;
      c.send('ACTION', { action: 'PRE_PICK', playerId: pickFromAvailable(A.state()) });
      await new Promise(r => setTimeout(r, 350));
    }
  }

  for (let i = 0; i < 3; i++) {
    const side = A.state().game.activeSide;
    const c = side === 'A' ? A : B;
    c.send('ACTION', { action: 'BAN', playerId: pickFromAvailable(A.state()) });
    await new Promise(r => setTimeout(r, 350));
  }

  const need = roundType === 'triple' ? 4 : 2;
  for (let i = 0; i < need; i++) {
    const phaseNow = A.state().game.phase;
    if (phaseNow === 'ROUND_END') break;
    const side = A.state().game.activeSide;
    assert.ok(side, `Round ${roundIdx}: activeSide is null at pick ${i + 1}`);
    const c = side === 'A' ? A : B;
    const id = pickFromAvailable(A.state());
    assert.ok(id, `Round ${roundIdx}: no available id`);
    const prev = A.msgs.filter(m => m.type === 'STATE').length;
    c.send('ACTION', { action: 'POST_PICK', playerId: id });
    await A.waitNewState(prev, 3000);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(A.state().game.phase !== 'PICK' || A.state().game.postPicks.length === i + 1, true,
      `Round ${roundIdx}: pick ${i + 1} did not advance state`);
  }
  assert.equal(A.state().game.phase, 'ROUND_END', `Round ${roundIdx} did not reach ROUND_END, stuck at ${A.state().game.phase}`);

  A.send('CONTINUE');
  await new Promise(r => setTimeout(r, 50));
  B.send('CONTINUE');
  await new Promise(r => setTimeout(r, 300));
}

test('完整 4 轮对战不卡在三选轮 PICK 阶段', async () => {
  const A = mk(), B = mk();
  await new Promise(r => setTimeout(r, 400));

  A.send('CREATE', { nickname: 'Alice' });
  const sA = await A.wait('SESSION');
  const code = sA.payload.code;
  B.send('JOIN', { code, nickname: 'Bob' });
  await B.wait('SESSION', 5000);

  A.send('READY', { ready: true });
  B.send('READY', { ready: true });
  for (let i = 0; i < 30; i++) {
    if (A.state()?.status === 'playing') break;
    await new Promise(r => setTimeout(r, 200));
  }
  assert.equal(A.state().status, 'playing');

  for (let r = 0; r < 4; r++) {
    await playRound(A, B, r);
  }

  A.ws.close(); B.ws.close();
});
