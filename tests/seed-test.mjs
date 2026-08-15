import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';

async function runWithSeed(seed) {
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
    createOscillator() { const o = { frequency: { value: 0 }, connect() { return o; }, start() {}, stop() {} }; return o; }
    createGain() { const g = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return g; } }; return g; }
  };
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);

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

  let appJs = readFileSync('./src/app.js', 'utf-8');
  appJs = appJs.replace(/^import.*$/gm, '');
  window.eval(appJs);

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  async function click(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.click();
  }

  // 开新局
  await click('[data-new]');
  await delay(50);
  await click('[data-start]');
  await delay(100);

  let game = window.__game();
  game.settings.difficulty = 'hard';  // 最严苛测试
  game.rng = seed;

  for (let r = 0; r < 6; r++) {
    if (game.phase !== 'order') continue;
    await click('[data-order="AI"]');
    await delay(50);

    let safety = 50;
    while (safety-- > 0) {
      await delay(150);
      const sub = game.subPhase;
      if (sub === 'summary') break;
      if (['prePick', 'postPick', 'pick', 'ban'].includes(sub)) {
        const removed = new Set([
          ...(game.roundBans || []).map(x => x.id),
          ...(game.prePicks || []),
          ...(game.postPicks || []),
        ]);
        const avail = (game.candidates || []).filter(id => !removed.has(id));
        if (avail.length === 0) break;
        const actor = (function(){
          if (sub === 'ban') return game.banTurn % 2 === 0 ? game.firstBan : (game.firstBan === 'PLAYER' ? 'AI' : 'PLAYER');
          if (sub === 'pick' || sub === 'prePick' || sub === 'postPick') {
            const taken = (sub === 'prePick' ? game.prePicks : game.postPicks || []).length;
            if (taken === 0) return game.firstPicker || 'PLAYER';
            return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
          }
          return null;
        })();
        if (actor !== 'PLAYER') continue;
        const targetId = avail[0];
        const cards = document.querySelectorAll(`[data-card="${targetId}"]`);
        if (cards.length === 0) break;
        cards[0].click();
        await delay(30);
        await click('[data-confirm]');
      }
    }
    await delay(150);

    if (game.phase === 'summary' && game.round < game.rounds.length - 1) {
      await click('[data-next]');
      await delay(50);
    }
  }

  return {
    seed,
    PLAYER: game.picks.PLAYER.length,
    AI: game.picks.AI.length,
    phase: game.phase,
    playerLines: game.picks.PLAYER.filter(id => id !== 'shared_courtois').reduce((acc, id) => {
      const p = game.players.find(p => p.id === id);
      if (p) acc[p.position] = (acc[p.position] || 0) + 1;
      return acc;
    }, {}),
  };
}

(async () => {
  for (let seed = 1; seed <= 5; seed++) {
    const result = await runWithSeed(seed);
    console.log(`seed=${result.seed} → PLAYER=${result.PLAYER}, AI=${result.AI}, phase=${result.phase}, lines=${JSON.stringify(result.playerLines)}`);
  }
})();