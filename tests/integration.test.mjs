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

async function main() {
  console.log('=== Test: 完整 6 轮流程 ===');

  await click('[data-new]');
  await delay(50);
  await click('[data-start]');
  await delay(100);

  let game = window.__game();
  console.log('New game: round=0, phase=' + game.phase);

  for (let r = 0; r < 6; r++) {
    console.log(`\n=== 第 ${r+1} 轮 ===`);
    if (game.phase !== 'order') {
      console.log('  phase=' + game.phase + ', skip');
      continue;
    }
    await click('[data-order="PLAYER"]');
    await delay(100);

    const roundType = game.rounds[game.round].type;
    let safety = 30;
    while (safety-- > 0) {
      await delay(200);
      const sub = game.subPhase;
      if (sub === 'summary') break;
      if (['prePick', 'postPick', 'pick', 'ban'].includes(sub)) {
        const removed = new Set([
          ...(game.roundBans || []).map(x => x.id),
          ...(game.prePicks || []),
          ...(game.postPicks || []),
        ]);
        const avail = (game.candidates || []).filter(id => !removed.has(id));
        if (avail.length === 0) {
          console.log(`  [${sub}] no available`);
          break;
        }
        const targetId = avail[0];
        // 模拟 game.__currentActor()
        const actor = (function(){
          if (sub === 'ban') return game.banTurn % 2 === 0 ? game.firstBan : (game.firstBan === 'PLAYER' ? 'AI' : 'PLAYER');
          if (sub === 'pick' || sub === 'prePick' || sub === 'postPick') {
            const taken = (sub === 'prePick' ? game.prePicks : game.postPicks || []).length;
            if (taken === 0) return game.firstPicker || 'PLAYER';
            return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
          }
          return null;
        })();
        if (actor !== 'PLAYER') {
          // AI 回合，等
          continue;
        }
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
    await delay(200);
    console.log(`  轮 ${r+1} 结束: subPhase=${game.subPhase}, PLAYER picks=${game.picks.PLAYER.length}, AI picks=${game.picks.AI.length}`);

    if (game.phase === 'summary' && game.round < game.rounds.length - 1) {
      await click('[data-next]');
      await delay(100);
    }
  }

  console.log('\n=== 最终 ===');
  console.log('PLAYER picks=' + game.picks.PLAYER.length);
  console.log('AI picks=' + game.picks.AI.length);
  console.log('phase=' + game.phase);
}

main().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});