// 回归测试：BP 完后的比赛模式（战术选择 → 出牌 → 快进 → 90 分钟 → 点球 / 结果）
import { WebSocket } from 'ws';
const URL = process.env.TEST_WS_URL || 'ws://localhost:3000/ws';

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
    errors() { return this.msgs.filter(m => m.type === 'ERROR').map(m => m.payload?.message || ''); },
    close() { this.ws.close(); },
  };
}

async function playBP(A, B) {
  for (let rnd = 0; rnd < 4; rnd++) {
    const owner = A.st()?.choiceOwner || 'A';
    (owner === 'A' ? A : B).send('ORDER', { choice: 'first' });
    await A.wait(400);

    let guard = 0;
    while (A.phase() !== 'ROUND_END' && guard++ < 200) {
      const phase = A.phase();
      if (!phase || phase === 'ORDER') break;
      const side = phase === 'ORDER' ? A.st()?.choiceOwner : A.st()?.game?.activeSide;
      if (!side) break;
      const c = side === 'A' ? A : B;
      const g = c.st()?.game || {};
      const removed = new Set([...(g.roundBans || []).map(x => x.id), ...(g.prePicks || []), ...(g.postPicks || [])]);
      const avail = (g.candidates || []).filter(id => !removed.has(id));
      if (!avail.length) break;
      const act = phase === 'PRE_PICK' ? 'PRE_PICK' : phase === 'BAN' ? 'BAN' : phase === 'POST_PICK' ? 'POST_PICK' : phase === 'PICK' ? 'PICK' : 'BAN';
      c.send('ACTION', { action: act, playerId: avail[0] });
      await A.wait(250);
    }
    if (A.phase() !== 'ROUND_END') throw new Error(`第${rnd + 1}轮卡 phase=${A.phase()} errors=${JSON.stringify(A.errors())}`);
    A.send('CONTINUE'); B.send('CONTINUE');
    await A.wait(400);
  }
  await A.wait(600);
  if (A.phase() !== 'LINEUP') throw new Error(`未进入 LINEUP，当前 ${A.phase()}`);
  A.send('LINEUP_READY'); B.send('LINEUP_READY');
  await A.wait(600);
}

async function main() {
  const A = mk('A'), B = mk('B');
  await A.open(); await B.open();
  A.send('CREATE', { nickname: 'Alice' });
  await A.wait(300);
  const code = A.st()?.code;
  if (!code) throw new Error('CREATE 失败');
  B.send('JOIN', { code, nickname: 'Bob' });
  await A.wait(300);
  A.send('READY', { ready: true }); B.send('READY', { ready: true });
  await A.wait(3500);

  await playBP(A, B);
  console.log(`✅ BP 完成 phase=${A.phase()}`);

  // 战术选择阶段：双方都选战术
  if (A.phase() !== 'tactical_pick') throw new Error(`战术阶段异常 phase=${A.phase()}`);
  A.send('SET_STYLE', { styleId: 'tikitaka' });
  await A.wait(400);
  B.send('SET_STYLE', { styleId: 'pressing' });
  await A.wait(700);

  if (A.phase() !== 'match') throw new Error(`未进入 match phase=${A.phase()}`);
  const matchA = A.st()?.game?.match;
  if (!matchA) throw new Error('match 状态丢失');
  if (matchA.aStyle !== 'tikitaka' || matchA.bStyle !== 'pressing') throw new Error(`战术风格未生效 a=${matchA.aStyle} b=${matchA.bStyle}`);
  if (matchA.phase !== 'match_draw') throw new Error(`比赛初始 phase 应为 match_draw 当前 ${matchA.phase}`);
  if (!Array.isArray(matchA.aDraw) || matchA.aDraw.length !== 3) throw new Error(`A 手牌数量异常 ${matchA.aDraw?.length}`);
  if (!Array.isArray(matchA.bDraw) || matchA.bDraw.length !== 3) throw new Error(`B 手牌数量异常 ${matchA.bDraw?.length}`);
  console.log(`✅ 进入比赛模式 aStyle=${matchA.aStyle} bStyle=${matchA.bStyle} handA=${matchA.aDraw.length} handB=${matchA.bDraw.length}`);

  // 出牌阶段：双方各打一张牌
  A.send('PLAY_CARD', { cardId: matchA.aDraw[0] });
  await A.wait(300);
  B.send('PLAY_CARD', { cardId: matchA.bDraw[0] });
  await A.wait(500);

  // 验证 aPlayed / bPlayed 不含 null
  const afterPlay = A.st()?.game?.match;
  if (afterPlay.aPlayed.some(x => x === null)) throw new Error('aPlayed 含 null');
  if (afterPlay.bPlayed.some(x => x === null)) throw new Error('bPlayed 含 null');
  if (afterPlay.aChoice !== null || afterPlay.bChoice !== null) throw new Error('出牌后 aChoice/bChoice 应为 null');
  console.log(`✅ 出牌后 aPlayed=${JSON.stringify(afterPlay.aPlayed)} bPlayed=${JSON.stringify(afterPlay.bPlayed)} phase=${afterPlay.phase} tick=${afterPlay.tickMinute}`);

  // 快进到结束（A 一路快进）
  let safety = 200;
  while (safety-- > 0) {
    const cur = A.phase();
    const m = A.st()?.game?.match;
    if (cur === 'finished' || cur === 'penalty' || cur === 'result') break;
    if (cur === 'match' && m?.phase === 'match_important') {
      // 双方都按继续
      A.send('MATCH_CONTINUE');
      B.send('MATCH_CONTINUE');
    } else if (cur === 'match' && m?.phase === 'match_draw') {
      A.send('FAST_FORWARD');
      B.send('FAST_FORWARD');
    } else {
      A.send('FAST_FORWARD');
      B.send('FAST_FORWARD');
    }
    await A.wait(250);
  }

  // 验证比赛结束流程
  const finalPhase = A.phase();
  if (finalPhase === 'match') throw new Error(`比赛未结束 phase=${finalPhase} match=${JSON.stringify(A.st()?.game?.match)}`);
  if (finalPhase === 'penalty') {
    // 等待点球自动跑完（理论上 startPenaltyShootout 同步结算）
    await A.wait(500);
  }
  // penalty 阶段需要 PENALTY_READY → result
  if (A.phase() === 'penalty') {
    A.send('PENALTY_READY');
    B.send('PENALTY_READY');
    await A.wait(400);
  }
  if (A.phase() !== 'result' && A.phase() !== 'finished') {
    // room.status === 'finished' 时 server 用 room.status 显示，但 game.phase 可能保持 'result'
    const st = A.st();
    if (!st?.game?.result) throw new Error(`比赛未结算 phase=${A.phase()} room.status=${st?.status}`);
  }
  const result = A.st()?.game?.result;
  if (!result) throw new Error('比赛 result 缺失');
  console.log(`✅ 比赛完成 phase=${A.phase()} winner=${result.winner} score=${result.ag}:${result.bg} penalty=${result.penalty ? 'yes' : 'no'}`);

  A.close(); B.close();
  console.log('\n🎉 全部通过');
}

main().catch(e => { console.error('❌', e.stack || e.message); process.exit(1); });
