// 单机 AI 模式测试：BP 完成 → 战术选择 → 出牌 → 比赛结束
// 复用 integration.test.mjs 的思路，但聚焦在比赛模式
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
  constructor() { this.currentTime = 0; this.destination = { connect() { return {}; } }; }
  createOscillator() { return { frequency: { value: 0 }, connect() { return this; }, start() {}, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } }; }
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const { PLAYER_DATA } = await import('../data/players.js');
const { COUNTRY_ZH, CLUB_ZH, LEAGUE_ZH } = await import('../data/i18n.js');
const { NAME_ZH, NAME_ZH_EXTRA } = await import('../data/names-zh.js');
const { OnlineClient } = await import('../src/online.js');
// 把 engine.js 的导出注入到 globalThis，使删掉 import 后的 app.js 仍能解析到这些常量
const ENGINE = await import('../src/engine.js');
for (const [k, v] of Object.entries(ENGINE)) global[k] = v;
global.PLAYER_DATA = PLAYER_DATA;
global.COUNTRY_ZH = COUNTRY_ZH; global.CLUB_ZH = CLUB_ZH; global.LEAGUE_ZH = LEAGUE_ZH;
global.NAME_ZH = NAME_ZH; global.NAME_ZH_EXTRA = NAME_ZH_EXTRA;
global.OnlineClient = OnlineClient;

const { readFileSync } = await import('fs');
let appJs = readFileSync('./src/app.js', 'utf-8');
// 删除多行与单行 import 语句（从 ^import 开始，直到 `;` 或 `}` 结束），规避引擎误把导入残片当成代码
appJs = appJs.replace(/^import\s+[\s\S]*?from\s*['"][^'"]+['"]\s*;?$/gm, '');
window.eval(appJs);

const delay = (ms) => new Promise(r => setTimeout(r, ms));
async function click(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('not found: ' + selector);
  el.click();
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
function positionOf(game, id) { return game.players.find(p => p.id === id)?.position; }
function availableIds(game, actor) {
  const removed = new Set([...(game.roundBans || []).map(x => x.id), ...(game.prePicks || []), ...(game.postPicks || [])]);
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
  await click('[data-new]'); await delay(50);
  await click('[data-start]'); await delay(100);
  let game = window.__game();
  console.log('初始 phase=' + game.phase + ', rounds=' + game.rounds.length);

  for (let r = 0; r < game.rounds.length; r++) {
    if (game.phase !== 'order') continue;
    await click('[data-order="PLAYER"]');
    await delay(100);

    let safety = 80;
    while (safety-- > 0) {
      await delay(200);
      game = window.__game();
      const sub = game.subPhase;
      if (sub === 'summary') break;
      if (['prePick', 'postPick', 'ban'].includes(sub)) {
        const actor = currentActor(game);
        if (actor !== 'PLAYER') continue;
        const avail = availableIds(game, 'PLAYER');
        if (!avail.length) break;
        const targetId = avail[0];
        const cards = document.querySelectorAll(`[data-card="${targetId}"]`);
        if (!cards.length) break;
        cards[0].click();
        await delay(50);
        await click('[data-confirm]');
      }
    }
    game = window.__game();
    await delay(200);
    console.log(`  轮 ${r+1} 结束: phase=${game.phase} picks=${game.picks.PLAYER.length}:${game.picks.AI.length}`);
    if (game.phase === 'summary' && game.round < game.rounds.length - 1) {
      await click('[data-next]');
      await delay(100);
    }
  }

  await delay(300);
  game = window.__game();
  console.log('BP 后 phase=' + game.phase + ' picks=' + game.picks.PLAYER.length + ':' + game.picks.AI.length);
  if (game.phase !== 'lineup') throw new Error('BP 后应为 lineup，实际 ' + game.phase);

  // 进入战术选择
  await click('[data-start-match]');
  await delay(200);
  game = window.__game();
  console.log('战术选择 phase=' + game.phase);
  if (game.phase !== 'tactical_pick') throw new Error('战术选择阶段异常 ' + game.phase);

  // 选择战术
  await click('[data-style="tikitaka"]');
  await delay(200);
  game = window.__game();
  console.log('战术后 phase=' + game.phase + ' aStyle=' + game.match?.aStyle + ' bStyle=' + game.match?.bStyle);
  if (game.phase !== 'match') throw new Error('战术选择后未进入 match 阶段，实际 ' + game.phase);
  if (game.match.aStyle !== 'tikitaka') throw new Error('aStyle 未生效 ' + game.match.aStyle);
  if (game.match.bStyle !== 'longball') throw new Error('bStyle 未生效 ' + game.match.bStyle);
  if (game.match.phase !== 'match_draw') throw new Error('match_draw phase 异常 ' + game.match.phase);
  if (!Array.isArray(game.match.aDraw) || game.match.aDraw.length !== 3) throw new Error('A 手牌异常 ' + JSON.stringify(game.match.aDraw));
  console.log('✅ 比赛初始化 OK handA=' + game.match.aDraw.length + ' handB=' + game.match.bDraw.length);

  // 出牌：玩家打第一张手牌
  const aHand = game.match.aDraw;
  await click(`[data-card="${aHand[0]}"]`);
  await delay(200);
  game = window.__game();
  console.log('出牌后 phase=' + game.phase + ' matchPhase=' + game.match?.phase + ' aPlayed=' + JSON.stringify(game.match?.aPlayed) + ' bPlayed=' + JSON.stringify(game.match?.bPlayed));
  if (game.match.aPlayed.some(x => x === null)) throw new Error('aPlayed 含 null');
  if (game.match.bPlayed.some(x => x === null)) throw new Error('bPlayed 含 null');
  if (game.match.aChoice !== null || game.match.bChoice !== null) throw new Error('aChoice/bChoice 未清零');

  // 一直快进直到结束
  let steps = 100;
  while (steps-- > 0) {
    await delay(200);
    game = window.__game();
    if (game.phase === 'result') break;
    if (game.phase === 'penalty') break;
    if (game.phase === 'match' && game.match?.phase === 'match_draw') {
      const fastBtn = document.querySelector('[data-fast-forward]');
      if (fastBtn) fastBtn.click();
    } else if (game.phase === 'match' && game.match?.phase === 'match_important') {
      const contBtn = document.querySelector('[data-match-continue]');
      if (contBtn) contBtn.click();
    }
  }

  await delay(300);
  game = window.__game();
  console.log('最终 phase=' + game.phase);
  if (game.phase === 'penalty') {
    const viewBtn = document.querySelector('[data-view-result]');
    if (viewBtn) viewBtn.click();
    await delay(300);
    game = window.__game();
  }
  if (game.phase !== 'result' && !game.result) throw new Error('未进入 result 且 result 缺失 phase=' + game.phase);
  if (!game.result) throw new Error('result 缺失');
  console.log('✅ 单机比赛完成 winner=' + game.result.winner + ' score=' + game.result.ag + ':' + game.result.bg);

  console.log('\n🎉 单机 AI 模式全部通过');
}

main().catch(e => { console.error('❌', e.stack || e.message); process.exit(1); });
