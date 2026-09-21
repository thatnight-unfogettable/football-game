// 端到端测试：BP + LINEUP 流程（v4 协议）
// ⚠️ 此测试需要先启动服务器：node server/server.js
// 由于 match 阶段的实时性（双方需精确同步出牌+继续），
// 完整 90 分钟 e2e 在 node:test 框架下易卡死，建议手动验证。
// 此测试只验证 BP+LINEUP 流程，match 逻辑由 match-regression/singleplayer 验证。
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
const URL = process.env.TEST_WS_URL || 'ws://localhost:3000/ws';

function mk() {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.on('message', raw => msgs.push(JSON.parse(raw.toString())));
  return {
    ws, msgs,
    open: () => new Promise((res, rej) => { if (ws.readyState === 1) return res(); ws.once('open', res); ws.once('error', rej); }),
    send(type, payload = {}) { this.ws.send(JSON.stringify({ type, payload, protocol: 4 })); },
    wait(ms) { return new Promise(r => setTimeout(r, ms)); },
    phase() { const arr = this.msgs.filter(m => m.type === 'STATE'); return arr.length ? (arr[arr.length - 1].payload?.game?.phase || '') : ''; },
    st() { const arr = this.msgs.filter(m => m.type === 'STATE'); return arr.length ? arr[arr.length - 1].payload : null; },
    close() { this.ws.close(); },
  };
}

test('e2e: BP+LINEUP 流程', async () => {
  const A = mk(), B = mk();
  await Promise.all([A.open(), B.open()]);

  // 创建房间 + 加入
  A.send('CREATE', { nickname: 'Alice' });
  await A.wait(400);
  const code = A.st()?.code;
  assert.match(code ?? '', /^\d{6}$/, '应得到 6 位房间码');

  B.send('JOIN', { code, nickname: 'Bob' });
  await A.wait(400);

  // 双方 ready，等开局
  A.send('READY', { ready: true }); B.send('READY', { ready: true });
  await A.wait(4500);
  assert.equal(A.phase(), 'ORDER', `开局应为 ORDER，实际 ${A.phase()}`);

  // 4 轮 BP（自动选 player）
  for (let rnd = 0; rnd < 4; rnd++) {
    const owner = A.st()?.choiceOwner || 'A';
    (owner === 'A' ? A : B).send('ORDER', { choice: 'first' });
    await A.wait(400);

    let guard = 0;
    while (A.phase() !== 'ROUND_END' && guard++ < 100) {
      const phase = A.phase();
      if (!phase || phase === 'ORDER') break;
      const side = A.st()?.game?.activeSide;
      if (!side) break;
      const c = side === 'A' ? A : B;
      const g = c.st()?.game || {};
      const removed = new Set([...(g.roundBans || []).map(x => x.id), ...(g.prePicks || []), ...(g.postPicks || [])]);
      const avail = (g.candidates || []).filter(id => !removed.has(id));
      if (!avail.length) break;
      const act = phase === 'PRE_PICK' ? 'PRE_PICK' : phase === 'BAN' ? 'BAN' : phase === 'POST_PICK' ? 'POST_PICK' : phase === 'PICK' ? 'PICK' : 'BAN';
      c.send('ACTION', { action: act, playerId: avail[0] });
      await A.wait(400);
    }
    assert.equal(A.phase(), 'ROUND_END', `第${rnd + 1}轮应为 ROUND_END，实际 ${A.phase()}`);

    A.send('CONTINUE'); B.send('CONTINUE');
    await A.wait(500);
  }

  // LINEUP
  await A.wait(800);
  assert.equal(A.phase(), 'LINEUP', `应为 LINEUP，实际 ${A.phase()}`);
  A.send('LINEUP_READY'); B.send('LINEUP_READY');
  await A.wait(800);
  assert.equal(A.phase(), 'tactical_pick', `应为 tactical_pick，实际 ${A.phase()}`);

  A.close(); B.close();
});
