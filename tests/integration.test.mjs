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
appJs = appJs.replace(/^import.*$/gm, '');
// 把所有顶层 var/let 暴露到 window
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

  // BO3 事件流：抽卡 -> 开球 -> 单场结算 -> 下一场/最终结算
  console.log('\n=== BO3 随机事件流程 ===');
  let seriesSafety = 30;
  while (seriesSafety-- > 0) {
    await delay(100);
    game = window.__game();
    if (game.phase === 'result') break;
    if (game.phase === 'lineup') {
      await click('[data-play]');
    } else if (game.phase === 'event') {
      const s = game.series;
      if (s?.stage === 'draw') {
        const cardEl = document.querySelector('[data-event-card]');
        if (!cardEl) throw new Error('event card not found');
        cardEl.click();
        await delay(50);
      }
      await click('[data-event-play]');
    } else if (game.phase === 'match') {
      await click('[data-match-next]');
    } else {
      console.log('  意外 phase=' + game.phase);
      break;
    }
  }
  game = window.__game();
  console.log('series phase=' + game.phase);
  console.log('result=' + JSON.stringify(game.result ? { winner: game.result.winner, pw: game.result.pw, aw: game.result.aw, matches: game.result.matches.length } : null));

  if (game.phase !== 'result') throw new Error('BO3 series did not reach result');
  if (game.picks.PLAYER.length !== 11 || game.picks.AI.length !== 11) throw new Error('picks not complete: ' + game.picks.PLAYER.length + '/' + game.picks.AI.length);
  if (game.result.matches.length < 2 || game.result.matches.length > 3) throw new Error('unexpected match count: ' + game.result.matches.length);
  console.log('\nPASS');
}

main().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
