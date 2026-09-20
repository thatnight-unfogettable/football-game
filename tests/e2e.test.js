// 端到端测试：4 轮 BP + BO3 完整流程
// 使用固定延迟让 server 有足够时间处理每条消息
import { WebSocket } from 'ws';
const URL = process.env.TEST_WS_URL || 'ws://localhost:3200/ws';

function mk(name) {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.on('message', raw => msgs.push(JSON.parse(raw.toString())));
  return {
    ws, name, msgs,
    open: () => new Promise((res) => { if (ws.readyState === 1) return res(); ws.once('open', res); }),
    send(type, payload = {}) { this.ws.send(JSON.stringify({ type, payload, protocol: 4 })); },
    wait(ms) { return new Promise(r => setTimeout(r, ms)); },
    phase() { const arr = this.msgs.filter(m => m.type === 'STATE'); return arr.length ? (arr[arr.length - 1].payload?.game?.phase || '') : ''; },
    st() { const arr = this.msgs.filter(m => m.type === 'STATE'); return arr.length ? arr[arr.length - 1].payload : null; },
    close() { this.ws.close(); },
  };
}

async function main() {
  const A = mk('A'), B = mk('B');
  await A.open(); await B.open();
  console.log('✅ 连接成功');
  A.send('CREATE', { nickname: 'Alice' });
  await A.wait(400);
  const code = A.st()?.code;
  if (!code) throw new Error('CREATE 失败');
  console.log(`✅ 房间 ${code}`);
  B.send('JOIN', { code, nickname: 'Bob' });
  await A.wait(400);
  A.send('READY', { ready: true }); B.send('READY', { ready: true });
  await A.wait(4500); // 等开局倒计时 3s
  if (A.phase() !== 'ORDER') throw new Error(`开局失败 phase=${A.phase()}`);
  console.log('✅ 开局', A.phase());

  for (let rnd = 0; rnd < 4; rnd++) {
    console.log(`\n─── 第${rnd + 1}轮 ───`);
    const owner = A.st()?.choiceOwner || 'A';
    console.log(`  choiceOwner=${owner}`);
    (owner === 'A' ? A : B).send('ORDER', { choice: 'first' });
    await A.wait(500);

    let guard = 0;
    while (A.phase() !== 'ROUND_END' && guard++ < 300) {
      const phase = A.phase();
      if (!phase || phase === 'ORDER') break;
      const side = phase === 'ORDER' ? (A.st()?.choiceOwner) : (A.st()?.game?.activeSide);
      if (!side) break;
      const c = side === 'A' ? A : B;
      const g = c.st()?.game || {};
      const removed = new Set([...(g.roundBans || []).map(x => x.id), ...(g.prePicks || []), ...(g.postPicks || [])]);
      const avail = (g.candidates || []).filter(id => !removed.has(id));
      if (!avail.length) break;
      const act = phase === 'PRE_PICK' ? 'PRE_PICK' : phase === 'BAN' ? 'BAN' : phase === 'POST_PICK' ? 'POST_PICK' : phase === 'PICK' ? 'PICK' : 'BAN';
      c.send('ACTION', { action: act, playerId: avail[0] });
      await A.wait(500);
    }
    if (A.phase() !== 'ROUND_END') throw new Error(`第${rnd + 1}轮卡 phase=${A.phase()}`);
    console.log(`  ✅ 完成 (${A.st().game.picks.A.length}:${A.st().game.picks.B.length})`);
    A.send('CONTINUE'); B.send('CONTINUE');
    await A.wait(600);
  }

  // LINEUP
  await A.wait(800);
  if (A.phase() !== 'LINEUP') throw new Error(`未进入 LINEUP，当前 ${A.phase()}`);
  console.log('\n─── LINEUP ───');
  A.send('LINEUP_READY'); B.send('LINEUP_READY');
  await A.wait(800);

  // BO3 事件卡 + 比赛
  for (let i = 0; i < 3; i++) {
    await A.wait(800);
    if (A.phase() === 'RESULT') break;
    if (A.phase() !== 'EVENT') throw new Error(`第${i+1}场 未进入 EVENT，当前 ${A.phase()}`);
    const s = A.st().game.series;
    console.log(`\n─── 第${i + 1}场 EVENT ───`);
    A.send('EVENT_CARD', { cardId: s.aDraw[0] });
    B.send('EVENT_CARD', { cardId: s.bDraw[0] });
    await A.wait(800);
    A.send('PLAY_MATCH'); B.send('PLAY_MATCH');
    await A.wait(800);
    if (A.phase() !== 'MATCH') throw new Error(`第${i+1}场 未进入 MATCH，当前 ${A.phase()}`);
    const mt = A.st().game.series.matches.at(-1);
    console.log(`  ✅ ${mt.ag}:${mt.bg} (${mt.venue})`);
    A.send('NEXT_MATCH'); B.send('NEXT_MATCH');
    await A.wait(600);
  }

  await A.wait(800);
  if (A.phase() !== 'RESULT') throw new Error(`未进入 RESULT，当前 ${A.phase()}`);
  const r = A.st().game.result;
  console.log(`\n✅ RESULT winner=${r.winner} score=${r.aWins}:${r.bWins} matches=${r.matches?.length}`);
  A.close(); B.close();
  process.exit(0);
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
