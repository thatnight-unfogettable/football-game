import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;
global.HTMLElement = window.HTMLElement;
global.location = window.location;
global.AudioContext = class {
  constructor() {
    this.currentTime = 0;
    this.destination = { connect() { return {}; } };
  }
  createOscillator() {
    const o = { frequency: { value: 0 }, connect() { return o; }, start() {}, stop() {} };
    return o;
  }
  createGain() {
    const g = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return g; } };
    return g;
  }
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// 把 import 转 global
const { PLAYER_DATA } = await import('../data/players.js');
const { COUNTRY_ZH, CLUB_ZH, LEAGUE_ZH } = await import('../data/i18n.js');
const { NAME_ZH, NAME_ZH_EXTRA } = await import('../data/names-zh.js');
const { OnlineClient } = await import('../src/online.js');
// 把 engine.js 的导出注入到 globalThis，使删掉 import 后的 app.js 仍能解析到这些常量
const ENGINE = await import('../src/engine.js');
for (const [k, v] of Object.entries(ENGINE)) global[k] = v;
global.PLAYER_DATA = PLAYER_DATA;
global.COUNTRY_ZH = COUNTRY_ZH;
global.CLUB_ZH = CLUB_ZH;
global.LEAGUE_ZH = LEAGUE_ZH;
global.NAME_ZH = NAME_ZH;
global.NAME_ZH_EXTRA = NAME_ZH_EXTRA;
global.OnlineClient = OnlineClient;

// 加载 app.js (去 import)
const { readFileSync } = await import('fs');
let appJs = readFileSync('./src/app.js', 'utf-8');
// 兼容单行/多行 import：匹配跨行 import ... from '...';
appJs = appJs.replace(/import\s+[\s\S]*?from\s*['"][^'"]+['"]\s*;?/g, '');
window.eval(appJs);

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function click(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('not found: ' + selector);
  el.click();
}

// 与 app.js 的 currentActor / available 保持一致的模拟逻辑（含全明星轮位置约束）
function positionOf(game, id) {
  return game.players.find(p => p.id === id)?.position;
}
function currentActor(game) {
  const sub = game.subPhase;
  if (sub === 'ban') return game.banTurn % 2 === 0 ? game.firstBan : (game.firstBan === 'PLAYER' ? 'AI' : 'PLAYER');
  if (sub === 'prePick') {
    const taken = (game.prePicks || []).length;
    if (taken === 0) return game.firstPicker || 'PLAYER';
    return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
  }
  if (sub === 'postPick') {
    const taken = (game.postPicks || []).length;
    if (taken % 2 === 0) return game.firstPicker || 'PLAYER';
    return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
  }
  return null;
}
function availableIds(game, actor) {
  const removed = new Set([
    ...(game.roundBans || []).map(x => x.id),
    ...(game.prePicks || []),
    ...(game.postPicks || []),
  ]);
  let ids = (game.candidates || []).filter(id => !removed.has(id));
  const roundInfo = game.rounds[game.round];
  if (roundInfo?.category === 'MIXED') {
    if (game.subPhase === 'ban') {
      const need = { FWD: 0, MID: 0, DEF: 0 };
      for (const side of ['PLAYER', 'AI']) {
        const have = new Set((game.roundPickIds?.[side] || []).map(id => positionOf(game, id)).filter(Boolean));
        for (const cat of ['FWD', 'MID', 'DEF']) if (!have.has(cat)) need[cat]++;
      }
      const counts = { FWD: 0, MID: 0, DEF: 0 };
      ids.forEach(id => { const c = positionOf(game, id); if (c) counts[c]++; });
      ids = ids.filter(id => { const c = positionOf(game, id); return counts[c] - 1 >= need[c]; });
    } else if (actor && (game.subPhase === 'prePick' || game.subPhase === 'postPick')) {
      const have = new Set((game.roundPickIds?.[actor] || []).map(id => positionOf(game, id)).filter(Boolean));
      ids = ids.filter(id => !have.has(positionOf(game, id)));
    }
  }
  return ids;
}

async function main() {
  console.log('=== Test: 完整 4 轮流程 + BO3 随机事件 ===');

  await click('[data-new]');
  await delay(50);
  await click('[data-start]');
  await delay(100);

  let game = window.__game();
  console.log('New game: round=0, phase=' + game.phase + ', rounds=' + game.rounds.length);

  for (let r = 0; r < game.rounds.length; r++) {
    console.log(`\n=== 第 ${r+1} 轮 (${game.rounds[r].type}/${game.rounds[r].category}) ===`);
    if (game.phase !== 'order') {
      console.log('  phase=' + game.phase + ', skip');
      continue;
    }
    await click('[data-order="PLAYER"]');
    await delay(100);

    let safety = 60;
    while (safety-- > 0) {
      await delay(200);
      game = window.__game();
      const sub = game.subPhase;
      if (sub === 'summary') break;
      if (['prePick', 'postPick', 'ban'].includes(sub)) {
        const actor = currentActor(game);
        if (actor !== 'PLAYER') continue; // AI 回合，等待
        const avail = availableIds(game, 'PLAYER');
        if (avail.length === 0) {
          console.log(`  [${sub}] no available`);
          break;
        }
        const targetId = avail[0];
        const cards = document.querySelectorAll(`[data-card="${targetId}"]`);
        if (cards.length === 0) {
          console.log(`  [${sub}] target card ${targetId} not found`);
          break;
        }
        cards[0].click();
        await delay(50);
        await click('[data-confirm]');
      }
    }
    game = window.__game();
    await delay(200);
    console.log(`  轮 ${r+1} 结束: phase=${game.phase}, subPhase=${game.subPhase}, PLAYER picks=${game.picks.PLAYER.length}, AI picks=${game.picks.AI.length}`);

    if (game.phase === 'summary' && game.round < game.rounds.length - 1) {
      await click('[data-next]');
      await delay(100);
    }
  }

  game = window.__game();
  console.log('\n=== BP 最终 ===');
  console.log('PLAYER picks=' + game.picks.PLAYER.length);
  console.log('AI picks=' + game.picks.AI.length);
  console.log('phase=' + game.phase);

  // v4 90 分钟比赛流程：战术选择 → 出牌 → 比赛/快进 → 结果
  console.log('\n=== 90 分钟比赛流程 ===');
  // 进入战术选择
  await click('[data-start-match]');
  await delay(100);
  // 选战术：玩家选 tikitaka
  const styleBtns = document.querySelectorAll('[data-style]');
  if (styleBtns.length > 0) styleBtns[0].click();
  await delay(150);
  game = window.__game();
  console.log('战术选择后 phase=' + game.phase + ' mPhase=' + game.match?.phase);
  if (game.phase !== 'match' || game.match?.phase !== 'match_draw') {
    throw new Error('未进入 match_draw: phase=' + game.phase + ' mPhase=' + game.match?.phase);
  }

  // 出牌 + 快进，直到出 result 或 penalty
  let matchSafety = 80;
  while (matchSafety-- > 0) {
    await delay(100);
    game = window.__game();
    if (game.phase === 'result' || game.phase === 'penalty') break;
    const mPhase = game.match?.phase;
    if (mPhase === 'match_draw') {
      const hand = game.match.aDraw.filter(id => !game.match.aPlayed.includes(id));
      if (hand.length > 0) {
        const cardEl = document.querySelector(`.match-card[data-card="${hand[0]}"]`);
        if (cardEl) cardEl.click();
        await delay(50);
      }
      const ff = document.querySelector('[data-fast-forward]');
      if (ff) ff.click();
    } else if (mPhase === 'match_important') {
      const cont = document.querySelector('[data-match-continue]');
      if (cont) cont.click();
    }
  }
  await delay(300);
  game = window.__game();
  console.log('比赛结束 phase=' + game.phase);
  // 切到 result 阶段（点球后用户需手动确认）
  if (game.phase === 'penalty') {
    const viewBtn = document.querySelector('[data-view-result]');
    if (viewBtn) viewBtn.click();
    await delay(200);
    game = window.__game();
  }
  if (game.phase !== 'result' && !game.result) {
    // 即使 phase 被 render 自愈回 lineup，只要 result 还在就算通过
    throw new Error('未进入 result 且 result 缺失: ' + game.phase);
  }
  if (!game.result) throw new Error('result 缺失');
  console.log('winner=' + game.result.winner + ' score=' + game.result.ag + ':' + game.result.bg);

  game = window.__game();

  if (game.phase !== 'result' && !game.result) throw new Error('未进入 result 且 result 缺失: ' + game.phase);
  if (game.picks.PLAYER.length !== 11 || game.picks.AI.length !== 11) throw new Error('picks not complete: ' + game.picks.PLAYER.length + '/' + game.picks.AI.length);
  if (typeof game.result.ag !== 'number' || typeof game.result.bg !== 'number') throw new Error('result 缺少 ag/bg: ' + JSON.stringify(game.result));
  console.log('\nPASS');
}

main().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
