import { PLAYER_DATA } from '../data/players.js';
import { OnlineClient } from './online.js';
import { COUNTRY_ZH, CLUB_ZH, LEAGUE_ZH } from '../data/i18n.js';
import { NAME_ZH, NAME_ZH_EXTRA } from '../data/names-zh.js';
// 从 engine.js 导入 v4 90分钟模式数据
import {
  MATCH_CARDS,
  EVENT_BY_ID,
  EVENT_TYPE_NAME,
  TACTICAL_STYLES,
  STYLE_BY_ID,
  startMatch90,
  drawMatchCards,
  aiPickMatchCard,
  setTacticalStyle,
  stylePhaseBonus,
  advanceToMinute,
  startPenaltyShootout,
  finishMatch90,
  resolveMatch90,
  getMatchSnapshot,
} from './engine.js';

const app = document.querySelector('#app');
const ACTIVE_KEY = 'football-bp-active-v1';
const HISTORY_KEY = 'football-bp-history-v1';
const RULE_VERSION = 4;
const BANS_PER_ROUND = 3;
// 4轮规则：前2轮双选16人，第3轮三选后卫14人，第4轮全明星混合三选14人（各位置1人）
// 轮次结构：type='double'(各选2人) 或 'triple'(各选3人)，category='MIXED'为全明星混合轮
const ROUND_PLAN = [
  { type:'double', category:'FWD', hint:'中锋/前锋' },
  { type:'double', category:'MID', hint:'中场' },
  { type:'triple', category:'DEF', hint:'后卫' },
  { type:'triple', category:'MIXED', hint:'各位置1人' },
];
const SLOT_ORDER = ['LW', 'ST', 'RW', 'CM1', 'CDM', 'CM2', 'LB', 'CB1', 'CB2', 'RB', 'GK'];
const SLOT_LABELS = { LW: '左边锋', ST: '中锋', RW: '右边锋', CM1: '中前卫', CDM: '后腰', CM2: '中前卫', LB: '左后卫', CB1: '中卫', CB2: '中卫', RB: '右后卫', GK: '门将' };
const POSITION_NAME = { FWD: '前锋', MID: '中场', DEF: '后卫', GK: '门将', MIXED: '全明星' };
// BO3随机事件卡（26张）：从 engine.js 统一导入 v4 90分钟 MATCH_CARDS
// 旧 BO3 常量已移除
const COURTOIS = { id: 'shared_courtois', name: '蒂博·库尔图瓦', englishName: 'Thibaut Courtois', rating: 90, position: 'GK', detailedPosition: 'GK', alternativePositions: [], club: '固定门将', league: '特殊卡', country: '比利时', grade: 'S' };
let game = null;
let selectedId = null;
let aiTimer = null;
let audioContext = null;
let online = { client: null, state: null, nickname: localStorage.getItem('football-bp-nickname') || '', error: '', invite: '', lastOwnPicks: [] };

const clone = (value) => JSON.parse(JSON.stringify(value));
const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function nameZh(player) { return NAME_ZH[player.englishName] || NAME_ZH[player.name] || player.name; }
function hashSeed(value) { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0 || 1; }
function rng() { let x = game.rng >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; game.rng = x >>> 0; return game.rng / 4294967296; }
function shuffle(list) { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }
function beep(type = 'select') { if (!game?.settings.audio) return; audioContext ||= new AudioContext(); const o = audioContext.createOscillator(); const g = audioContext.createGain(); o.frequency.value = { ban:160, select:420, win:660, lose:110 }[type] || 280; g.gain.setValueAtTime(.06, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .16); o.connect(g).connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime + .17); }
function save() { if (game && !['menu','history'].includes(game.screen)) localStorage.setItem(ACTIVE_KEY, JSON.stringify(game)); }
function histories() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } }
function storeHistory(record) { const list = histories(); list.unshift(record); localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 20))); }
function player(id) { return id === COURTOIS.id ? COURTOIS : game.players.find(p => p.id === id); }
function gradeScore(grade) { return ({ SSS:8, SS:7, S:6, A:5, B:4, C:3, D:2, E:1 })[grade] || 3; }
function translateValue(map, value) {
  if (!value) return value;
  if (/[\u3400-\u9fff]/.test(value)) return value;
  return map[value] || map[value.trim()] || value;
}
const PLAYER_NAME_MAP = { ...NAME_ZH, ...NAME_ZH_EXTRA };
function normalizePlayers() {
  return PLAYER_DATA.map(p => ({
    ...p,
    englishName: p.englishName || p.name,
    name: PLAYER_NAME_MAP[p.englishName] || PLAYER_NAME_MAP[p.name] || p.name,
    alternativePositions: p.alternativePositions || inferAlternatives(p.detailedPosition),
    club: translateValue(CLUB_ZH, p.club) || '未知俱乐部',
    league: translateValue(LEAGUE_ZH, p.league) || '未知联赛',
    country: translateValue(COUNTRY_ZH, p.country) || '未知国籍',
  }));
}
function inferAlternatives(pos) {
  const map = { ST:['CF'], CF:['ST','CAM'], LW:['LM','RW'], RW:['RM','LW'], LM:['LW','CM'], RM:['RW','CM'], CAM:['CM','CF'], CM:['CAM','CDM'], CDM:['CM','CB'], LB:['LWB','CB'], RB:['RWB','CB'], LWB:['LB','LM'], RWB:['RB','RM'], CB:['LB','RB','CDM'], GK:[] };
  return map[pos] || [];
}
const NORMALIZED_PLAYERS = normalizePlayers();
const NORMALIZED_PLAYER_MAP = new Map(NORMALIZED_PLAYERS.map(p => [p.id, p]));
function generateRoundPool(category, size, usedIds) {
  // 从指定类别中按评分筛选前若干人，每层取3，确保球员不重复
  const pool = game.players.filter(p => p.position === category && !usedIds.has(p.id)).sort((a,b) => b.rating - a.rating);
  const top = pool.slice(0, size * 4);
  const tierSize = Math.ceil(top.length / 4);
  const tiers = Array.from({length:4}, (_,i) => shuffle(top.slice(i*tierSize, (i+1)*tierSize)));
  const cards = [];
  for (let i = 0; i < 4; i++) {
    const take = Math.min(3, tiers[i].length);
    cards.push(...tiers[i].splice(0, take));
  }
  while (cards.length < size) {
    const tier = tiers.find(t => t.length);
    if (!tier) break;
    cards.push(tier.shift());
  }
  // 补到 size（如不够则降级）
  while (cards.length < size && pool.length > cards.length) {
    const remain = pool.filter(p => !cards.some(c => c.id === p.id));
    if (!remain.length) break;
    cards.push(remain.shift());
  }
  return shuffle(cards).map(p => p.id);
}
function generateRounds() {
  const rounds = [];
  const used = new Set();
  for (const round of ROUND_PLAN) {
    const size = round.type === 'double' ? 16 : 14;
    const pool = round.category === 'MIXED'
      ? generateMixedPool(size, used)
      : generateRoundPool(round.category, size, used);
    rounds.push({ type: round.type, category: round.category, hint: round.hint, candidates: pool });
    pool.forEach(id => used.add(id));
  }
  return rounds;
}
function generateMixedPool(size, usedIds) {
  // 全明星轮：FWD 5 + MID 5 + DEF 4，混合洗牌，保证各位置供需可满足
  const take = { FWD: 5, MID: 5, DEF: 4 };
  const parts = [];
  for (const [category, n] of Object.entries(take)) {
    const pool = game.players.filter(p => p.position === category && !usedIds.has(p.id)).sort((a,b) => b.rating - a.rating);
    parts.push(...shuffle(pool.slice(0, n)).map(p => p.id));
  }
  return shuffle(parts).slice(0, size);
}
function newGame(settings) {
  const seedText = `${Date.now()}-${Math.random()}-${settings.difficulty}-${settings.personality}`;
  game = {
    version: RULE_VERSION,
    screen: 'order',
    phase: 'order',
    seed: seedText,
    rng: hashSeed(seedText),
    settings,
    players: normalizePlayers(),
    rounds: [],
    round: 0,
    // 轮次状态：阶段 = prePick(各选1人) -> ban(轮流ban 3次) -> postPick(各选1~2人)
    subPhase: null,
    banTurn: 0,
    firstBan: 'PLAYER',
    firstPicker: 'PLAYER',
    roundPickIds: { PLAYER: [], AI: [] }, // 全明星轮按位置约束用
    selected: null,
    candidates: [],
    bans: { PLAYER: [], AI: [] }, // 所有禁用
    roundBans: [], // 当前轮次内已ban
    picks: { PLAYER: [COURTOIS.id], AI: [COURTOIS.id] }, // 已选
    prePicks: [], // 双方先选的人（中间变量）
    postPicks: [],
    log: [],
    snapshots: [],
    lineup: { PLAYER: null, AI: null },
    series: null, // 旧 BO3，已移除，BP 完成后用 match: null
    result: null,
  };
  game.rounds = generateRounds();
  snapshot('对局开始'); save(); render();
}
function snapshot(label) {
  game.snapshots.push({
    label,
    round: game.round,
    phase: game.phase,
    subPhase: game.subPhase,
    bans: clone(game.bans),
    picks: clone(game.picks),
    prePicks: clone(game.prePicks || []),
    candidates: clone(game.candidates),
    log: clone(game.log),
  });
}
function beginRound(order) {
  const roundInfo = game.rounds[game.round];
  game.firstBan = order;
  game.firstPicker = order;
  game.candidates = [...roundInfo.candidates];
  game.roundBans = [];
  game.prePicks = [];
  game.postPicks = [];
  game.roundPickIds = { PLAYER: [], AI: [] };
  game.banTurn = 0;
  // 双选/三选轮统一：先各选1人 -> 禁用3次 -> 再各选1~2人；先选者获得先禁权
  game.phase = 'prePick';
  game.subPhase = 'prePick';
  selectedId = null;
  game.log.push({ type: 'round', round: game.round + 1, info: roundInfo, candidates: [...game.candidates], firstBan: order, mode: roundInfo.type });
  snapshot(`第${game.round+1}轮候选揭晓（${roundInfo.type==='double'?'16人双选':roundInfo.category==='MIXED'?'14人全明星':'14人三选'}）`);
  save(); render(); scheduleAI();
}
function currentActor() {
  if (!game) return null;
  const roundInfo = game.rounds && Number.isInteger(game.round) ? game.rounds[game.round] : null;
  if (!roundInfo) return null;
  if (game.subPhase === 'prePick') {
    // 双方轮流选1人
    const taken = (game.prePicks || []).length;
    if (taken === 0) return game.firstPicker || 'PLAYER';
    return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
  }
  if (game.subPhase === 'ban') {
    return game.banTurn % 2 === 0 ? game.firstBan : (game.firstBan === 'PLAYER' ? 'AI' : 'PLAYER');
  }
  if (game.subPhase === 'postPick') {
    // postPick：先选者先选，双方轮流（三选轮共4次、双选轮共2次）
    const postTaken = (game.postPicks || []).length;
    if (postTaken % 2 === 0) return game.firstPicker || 'PLAYER';
    return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
  }
  return null;
}
function available(actor = null) {
  const removed = new Set([
    ...((game.roundBans || []).map(x=>x.id)),
    ...(game.prePicks || []),
    ...(game.postPicks || []),
  ]);
  let ids = (game.candidates || []).filter(id => !removed.has(id));
  const roundInfo = game.rounds[game.round];
  if (roundInfo?.category === 'MIXED') {
    if (game.subPhase === 'ban') {
      // 全明星轮：禁止把某个位置ban到双方都无球可选
      const need = { FWD: 0, MID: 0, DEF: 0 };
      for (const side of ['PLAYER', 'AI']) {
        const have = new Set((game.roundPickIds?.[side] || []).map(id => player(id)?.position).filter(Boolean));
        for (const cat of ['FWD', 'MID', 'DEF']) if (!have.has(cat)) need[cat]++;
      }
      const counts = { FWD: 0, MID: 0, DEF: 0 };
      ids.forEach(id => { const c = player(id)?.position; if (c) counts[c]++; });
      ids = ids.filter(id => { const c = player(id)?.position; return counts[c] - 1 >= need[c]; });
    } else if (actor && (game.subPhase === 'prePick' || game.subPhase === 'postPick')) {
      // 全明星轮：已选过的位置不可再选
      const have = new Set((game.roundPickIds?.[actor] || []).map(id => player(id)?.position).filter(Boolean));
      ids = ids.filter(id => !have.has(player(id)?.position));
    }
  }
  return ids;
}
function confirmPlayerAction() {
  if (!selectedId || currentActor() !== 'PLAYER') return;
  if (game.subPhase === 'prePick' || game.subPhase === 'postPick') {
    applyPrePick('PLAYER', selectedId, '玩家选择');
  } else if (game.subPhase === 'ban') {
    applyBan('PLAYER', selectedId, '玩家决策');
  }
}
function applyPrePick(actor, id, reason) {
  if (!available(actor).includes(id)) return;
  if (game.subPhase === 'prePick') {
    if (!game.prePicks) game.prePicks = [];
    game.prePicks.push(id);
    game.picks[actor].push(id);
    if (!game.roundPickIds) game.roundPickIds = { PLAYER: [], AI: [] };
    game.roundPickIds[actor].push(id);
    game.log.push({ type: 'prePick', round: game.round + 1, actor, id, reason });
    beep('select');
    snapshot(`${actor==='PLAYER'?'玩家':'AI'}初始选择${nameZh(player(id))}`);
    if (actor === 'PLAYER') maybePlayChemistry(id);
    if (game.prePicks.length >= 2) {
      // 切换到ban阶段
      game.subPhase = 'ban';
      game.phase = 'ban';
      game.banTurn = 0;
      // 先选者获得先禁权（与prePick先后手一致）
      // 但我们的实现中先选者先ban是合理的设计：先选者已经建立了阵容，可以ban对手想选的
      game.firstBan = game.firstPicker;
      save(); render(); scheduleAI();
    } else {
      save(); render(); scheduleAI();
    }
  } else if (game.subPhase === 'postPick') {
    if (!game.postPicks) game.postPicks = [];
    game.postPicks.push(id);
    game.picks[actor].push(id);
    if (!game.roundPickIds) game.roundPickIds = { PLAYER: [], AI: [] };
    game.roundPickIds[actor].push(id);
    game.log.push({ type: 'postPick', round: game.round + 1, actor, id, reason });
    beep('select');
    snapshot(`${actor==='PLAYER'?'玩家':'AI'}再选${nameZh(player(id))}`);
    if (actor === 'PLAYER') maybePlayChemistry(id);
    const needPicks = game.rounds[game.round].type === 'triple' ? 4 : 2;
    if (game.postPicks.length >= needPicks) {
      game.subPhase = 'summary';
      game.phase = 'summary';
      save(); render();
    } else {
      save(); render(); scheduleAI();
    }
  }
}
function applyBan(actor, id, reason) {
  if (!available().includes(id) || game.subPhase !== 'ban') return;
  game.roundBans.push({ actor, id, reason });
  game.bans[actor].push(id);
  game.log.push({ type: 'ban', round: game.round + 1, actor, id, reason });
  game.banTurn++;
  selectedId = null;
  beep('ban');
  snapshot(`${actor==='PLAYER'?'玩家':'AI'}禁用${nameZh(player(id))}`);
  // 每轮统一禁用3次后切换到postPick
  if (game.banTurn >= BANS_PER_ROUND) {
    game.subPhase = 'postPick';
    game.phase = 'postPick';
    game.postPicks = [];
  }
  save(); render(); scheduleAI();
}

// 取新球员与现有阵容中配合度最高的组合（化学加成 > 4 才返回）
function findChemistryCombo(newPlayerId, existingIds, playerLookup = player) {
  const candidate = playerLookup(newPlayerId);
  if (!candidate) return null;
  // 同俱乐部/联赛/国家加成权重（与 candidateThreat 对齐：club=5, league=2, country=3）
  const linkScore = (a, b) =>
    (a.club === b.club ? 5 : 0) +
    (a.league === b.league && a.club !== b.club ? 2 : 0) +
    (a.country === b.country && a.club !== b.club ? 3 : 0);
  // 现有阵容中与新球员化学加成 > 4 的球员
  const links = [];
  for (const id of existingIds) {
    if (id === COURTOIS.id) continue;
    const p = playerLookup(id);
    if (!p) continue;
    const score = linkScore(candidate, p);
    if (score > 4) links.push({ id, p, score });
  }
  if (links.length === 0) return null;
  // 排序后取分数最高的组合（含新球员）
  links.sort((a, b) => b.score - a.score);
  const total = links.reduce((s, x) => s + x.score, 0);
  return { newPlayerId, partner: links, total, best: links[0] };
}

// 触发化学反应动画：把球员卡飞入中心展示
function triggerChemistryAnimation(combo, playerLookup = player) {
  if (!combo) return;
  const { newPlayerId, partner, total, best } = combo;
  const newP = playerLookup(newPlayerId);
  if (!newP) return;
  // 隐藏已存在的 overlay
  document.querySelector('.chemistry-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'chemistry-overlay';
  // 关联球员卡（按分数从高到低排序，新球员居中）
  const sorted = [newP, ...partner.map(x => x.p)];
  const overlayHTML = `
    <div class="chemistry-backdrop"></div>
    <div class="chemistry-stage">
      <div class="chemistry-banner">
        <span class="chemistry-kicker">化学反应组合</span>
        <h2>${esc(newP.name)} × ${partner.length} 名队友</h2>
        <p>同俱乐部/联赛/国家加成 · 总计 <b>+${total}</b> · 最高 <b>+${best.score}</b></p>
      </div>
      <div class="chemistry-cards">
        ${sorted.map((p, i) => {
          const isNew = p.id === newPlayerId;
          const link = partner.find(x => x.p.id === p.id);
          const tag = isNew ? '<span class="ch-tag ch-tag-new">新球员</span>' :
            (link ? `<span class="ch-tag">+${link.score}</span>` : '');
          const reason = link
            ? (best.p.id === p.id ? '默契搭档' :
              (p.club === newP.club ? '同俱乐部' :
                (p.league === newP.league ? '同联赛' : '同国家队')))
            : '新球员';
          return `<div class="chemistry-card ${isNew ? 'is-new' : ''}">
            <span class="card-grade">${p.grade}</span>
            <b class="card-rating">${p.rating}</b>
            <span class="avatar">${esc((p.name||p.englishName).slice(0,1))}</span>
            <strong>${esc(p.name)}</strong>
            <small>${esc(p.englishName||'')}</small>
            <div class="ch-meta">${esc(p.club)} · ${esc(p.country)}</div>
            <div class="ch-meta">${reason}</div>
            ${tag}
          </div>`;
        }).join('')}
      </div>
      <button class="primary chemistry-close">点击继续</button>
    </div>
  `;
  overlay.innerHTML = overlayHTML;
  document.body.appendChild(overlay);
  // 触发重排后展示
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    // 仅玩家主动点击继续 / 点击背景时才关闭
    function close() {
      overlay.classList.remove('visible');
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 400);
    }
    overlay.querySelector('.chemistry-close')?.addEventListener('click', close);
    overlay.querySelector('.chemistry-backdrop')?.addEventListener('click', close);
  });
}

// 玩家选人后检查化学反应组合，存在则触发动画
function maybePlayChemistry(newPlayerId) {
  if (!game || !game.picks || !game.picks.PLAYER) return;
  // 玩家当前阵容（排除刚选的新球员和库尔图瓦）
  const existing = game.picks.PLAYER.filter(id => id !== newPlayerId && id !== COURTOIS.id);
  if (existing.length === 0) return;
  const combo = findChemistryCombo(newPlayerId, existing);
  if (!combo) return;
  // 等待新选球员的卡片进入阵型图后展示（与 render 同帧）
  requestAnimationFrame(() => {
    // 延迟到过渡完成
    setTimeout(() => triggerChemistryAnimation(combo), 80);
  });
}
function candidateThreat(id, actor, action) {
  const p = player(id); const own = game.picks[actor].map(player); const enemy = game.picks[actor==='AI'?'PLAYER':'AI'].map(player);
  const ownLinks = own.reduce((n,x)=>n+(x.club===p.club?5:0)+(x.league===p.league?2:0)+(x.country===p.country?3:0),0);
  const enemyLinks = enemy.reduce((n,x)=>n+(x.club===p.club?4:0)+(x.league===p.league?1:0)+(x.country===p.country?2:0),0);
  const personality = game.settings.personality;
  if (action==='ban') return p.rating + (personality==='counter'?enemyLinks*1.2:enemyLinks*.4);
  return p.rating + (personality==='chemistry'?ownLinks*1.3:ownLinks*.35) + (personality==='counter'?enemyLinks*.25:0);
}
function aiChoice(action, actor = 'AI') {
  const ids = available(action === 'ban' ? null : actor);
  const difficulty = game?.settings?.difficulty || 'normal';
  const mistake = {easy:.30, normal:.15, hard:.05}[difficulty];
  if (ids.length === 0) return null;
  if (rng() < mistake) return ids[Math.floor(rng()*ids.length)];
  const scored = ids.map(id => ({id, score: candidateThreat(id, 'AI', action)})).sort((a,b) => b.score - a.score);
  if (difficulty === 'hard') return scored.slice(0, Math.min(5, scored.length)).map((x,i) => ({...x, score: x.score + (5-i)*.15})).sort((a,b) => b.score - a.score)[0].id;
  return scored[0].id;
}
function scheduleAI() {
  clearTimeout(aiTimer);
  try {
    const actor = currentActor();
    if (actor !== 'AI') return;
  } catch (err) {
    console.error('[scheduleAI] currentActor failed:', err);
    return;
  }
  aiTimer = setTimeout(() => {
    try {
      const sub = game.subPhase;
      let action = sub;
      if (sub === 'prePick' || sub === 'postPick') action = 'pick';
      if (sub === 'ban') action = 'ban';
      const id = aiChoice(action, 'AI');
      if (!id) return;
      const p = player(id);
      const reason = sub === 'ban'
        ? (p.rating >= 88 ? '高评分威胁' : (game.settings.personality === 'counter' ? '阻断你的组合' : '控制候选池'))
        : (p.rating >= 88 ? '纸面核心' : (game.settings.personality === 'chemistry' ? '增强化学反应' : '提升综合实力'));
      if (sub === 'prePick' || sub === 'postPick') {
        applyPrePick('AI', id, reason);
      } else if (sub === 'ban') {
        applyBan('AI', id, reason);
      }
    } catch (err) {
      console.error('[AI turn] failed:', err);
    }
  }, {fast:250, normal:750, slow:1400}[game.settings?.speed || 'normal']);
}
function continueRound() {
  // 重置轮次状态
  game.prePicks = [];
  game.postPicks = [];
  game.roundBans = [];
  game.roundPickIds = { PLAYER: [], AI: [] };
  game.banTurn = 0;
  game.selected = null;
  if (game.round >= game.rounds.length - 1) { finalizeLineups(); return; }
  game.round++;
  game.phase = 'order';
  game.screen = 'order';
  save(); render();
}
function roleFit(p, slot) {
  if (slot==='GK') return p.position==='GK'?1:0;
  const target = slot.replace(/[12]/g,''); const pos=p.detailedPosition || p.position; const alt=p.alternativePositions||[];
  if(pos===target) return 1; if(alt.includes(target)) return .96;
  const near={LW:['RW','LM','ST','CF'],RW:['LW','RM','ST','CF'],ST:['CF','LW','RW'],CM:['CAM','CDM','LM','RM'],CDM:['CM','CB'],LB:['LWB','CB'],RB:['RWB','CB'],CB:['LB','RB','CDM']}[target]||[];
  return near.includes(pos) ? .96 : .92;
}
function bestAssignment(ids) {
  const cards = ids.map(player);
  const slots = SLOT_ORDER.filter(s => s !== 'GK');
  const byLine = { FWD: slots.slice(0, 3), MID: slots.slice(3, 6), DEF: slots.slice(6, 10) };
  const result = { GK: COURTOIS.id };
  const used = new Set([COURTOIS.id]);
  for (const [line, lineSlots] of Object.entries(byLine)) {
    const pool = cards.filter(p => p.position === line && !used.has(p.id));
    const remaining = [...pool];
    for (const slot of lineSlots) {
      if (remaining.length === 0) break;
      let best = remaining.map((p, i) => ({ i, v: p.rating * roleFit(p, slot) })).sort((a, b) => b.v - a.v)[0];
      const [picked] = remaining.splice(best.i, 1);
      result[slot] = picked.id;
      used.add(picked.id);
    }
  }
  // 兜底：如果还有未分配的 slot，从所有剩余 picks 里按 rating 填满
  const allRemaining = cards.filter(p => !used.has(p.id));
  for (const slot of slots) {
    if (result[slot]) continue;
    if (allRemaining.length === 0) break;
    let best = allRemaining.map((p, i) => ({ i, v: p.rating * roleFit(p, slot) })).sort((a, b) => b.v - a.v)[0];
    const [picked] = allRemaining.splice(best.i, 1);
    result[slot] = picked.id;
    used.add(picked.id);
  }
  return result;
}
function lineupMetrics(assignment) {
  const entries = SLOT_ORDER.map(slot => {
    const id = assignment[slot];
    const p = id ? player(id) : null;
    return { slot, p, fit: p ? roleFit(p, slot) : 0 };
  }).filter(x => x.p);
  const lineAverage = line => {
    const rows = entries.filter(x => x.p.position === line);
    if (rows.length === 0) return 0;
    return rows.reduce((s,x) => s + x.p.rating * x.fit, 0) / rows.length;
  };
  // paper: 0-100 制
  const paper = lineAverage('GK')*.1 + lineAverage('DEF')*.3 + lineAverage('MID')*.3 + lineAverage('FWD')*.3;
  const nonGk = entries.filter(x => x.slot !== 'GK');
  const slotFit = nonGk.length > 0 ? (nonGk.reduce((s,x) => s + x.fit, 0) / Math.min(nonGk.length, 10)) * 32 : 0;
  const roles = {FWD:['LW','ST','RW'], MID:['CM1','CDM','CM2'], DEF:['LB','CB1','CB2','RB']};
  let template = 0;
  Object.values(roles).forEach(slots => {
    const complete = slots.every(slot => {
      const id = assignment[slot];
      const p = id ? player(id) : null;
      return p && roleFit(p, slot) >= .96;
    });
    if (complete) template += 8/3;
  });
  const groupScore = (field, thresholds, cap) => {
    const counts = {};
    nonGk.forEach(x => counts[x.p[field]] = (counts[x.p[field]] || 0) + 1);
    let total = 0;
    Object.values(counts).forEach(n => {
      let best = 0;
      thresholds.forEach(([need, score]) => { if (n >= need) best = score; });
      total += best;
    });
    return Math.min(cap, total);
  };
  const club = groupScore('club', [[2,4],[3,8],[4,12]], 20);
  const league = groupScore('league', [[2,3],[4,7],[6,11]], 15);
  const nation = groupScore('country', [[2,3],[3,6],[5,10]], 15);
  const ratings = nonGk.map(x => x.p.rating);
  const leaders = Math.min(6, ratings.filter(r => r >= 85).length * 2);
  const gap = ratings.length >= 2 ? Math.max(...ratings) - Math.min(...ratings) : 0;
  const balance = gap <= 8 ? 4 : gap <= 12 ? 3 : gap <= 16 ? 2 : gap <= 20 ? 1 : 0;
  const chemistry = Math.min(100, slotFit + template + club + league + nation + leaders + balance);
  // 综合实力 = (paper + chemistry) / 2
  const overall = (paper + chemistry) / 2;
  return {
    paper,
    chemistry,
    overall,
    lines: { FWD: lineAverage('FWD'), MID: lineAverage('MID'), DEF: lineAverage('DEF'), GK: 90 },
    parts: { slotFit, template, club, league, nation, grade: leaders + balance }
  };
}
function currentMetrics(side) {
  return lineupMetrics(assignToSlots(game.picks[side]));
}
function previewChemistryDelta(side, candidateId) {
  if (game.picks[side].includes(candidateId)) return 0;
  const preview = lineupMetrics(assignToSlots([...game.picks[side], candidateId]));
  return Math.round((preview.chemistry - currentMetrics(side).chemistry) * 10) / 10;
}
// 同步设置 lineup.A / lineup.B（engine.js 的比赛 tickMinuteBernoulli 等使用 A/B 键名）。
// 保留 PLAYER/AI 兼容前端其余渲染逻辑。
function finalizeLineups() {
  const playerAssignment = bestAssignment(game.picks.PLAYER);
  const aiAssignment = bestAssignment(game.picks.AI);
  game.lineup.PLAYER = playerAssignment;
  game.lineup.AI = aiAssignment;
  game.lineup.A = playerAssignment;
  game.lineup.B = aiAssignment;
  game.phase = 'lineup';
  game.screen = 'lineup';
  snapshot('阵容自动排布');
  save();
  render();
}
function assignToSlots(picks) {
  // BP 阶段：根据已选球员动态分配至 4-3-3 阵型 slot
  // picks 中始终包含 COURTOIS，GK 固定给库尔图瓦
  const cards = picks.map(player);
  const result = { GK: COURTOIS.id };
  const used = new Set([COURTOIS.id]);
  const slots = SLOT_ORDER.filter(s => s !== 'GK');
  const byLine = { FWD: slots.slice(0, 3), MID: slots.slice(3, 6), DEF: slots.slice(6, 10) };
  for (const [line, lineSlots] of Object.entries(byLine)) {
    const pool = cards.filter(p => p.position === line && !used.has(p.id));
    const remaining = [...pool];
    for (const slot of lineSlots) {
      if (remaining.length === 0) break;
      let best = remaining.map((p, i) => ({ i, v: p.rating * roleFit(p, slot) })).sort((a, b) => b.v - a.v)[0];
      const [picked] = remaining.splice(best.i, 1);
      result[slot] = picked.id;
      used.add(picked.id);
    }
  }
  // 兜底：剩余 slot 用 rating 最高的剩余球员填充
  const allRemaining = cards.filter(p => !used.has(p.id));
  for (const slot of slots) {
    if (result[slot]) continue;
    if (allRemaining.length === 0) break;
    let best = allRemaining.map((p, i) => ({ i, v: p.rating * roleFit(p, slot) })).sort((a, b) => b.v - a.v)[0];
    const [picked] = allRemaining.splice(best.i, 1);
    result[slot] = picked.id;
    used.add(picked.id);
  }
  return result;
}
// 旧 BO3 残留辅助函数（dead code，保留以防外部测试引用）
function normalRandom() { const u=1-rng(),v=1-rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function poisson(lambda) { const l=Math.exp(-lambda);let p=1,k=0;do{k++;p*=rng();}while(p>l&&k<10);return k-1; }
function drawEventCards(count, excludeIds, noCarry = false) {
  const pool = MATCH_CARDS.filter(c => !excludeIds.includes(c.id));
  const drawn = [];
  while (drawn.length < count && pool.length) {
    const totalW = pool.reduce((s, c) => s + (c.weight || 1), 0);
    let r = rng() * totalW, idx = 0;
    for (let i = 0; i < pool.length; i++) { r -= pool[i].weight || 1; if (r <= 0) { idx = i; break; } }
    drawn.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return drawn;
}
// ─── 90分钟比赛函数（v4，调用 engine.js）───
function getRng() {
  let x = game.rng >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  game.rng = x >>> 0;
  return game.rng / 4294967296;
}

function aiRng() {
  return { next: () => getRng() };
}

// 战术风格选择界面（BP 完成后，比赛开始前）
function showTacticalPick() {
  game.phase = 'tactical_pick';
  game.screen = 'tactical_pick';
  snapshot('选择战术风格');
  save(); render();
}

// 选择战术风格
function pickTacticalStyle(styleId) {
  game.match = game.match || {};
  game.match.aStyle = styleId;
  game.match.bStyle = 'longball'; // AI 默认长传冲吊
  snapshot(`玩家选择战术：${STYLE_BY_ID[styleId]?.name}`);
  save(); render();
  // 初始化 90 分钟比赛
  startMatch90(game, aiRng());
  snapshot('90分钟比赛开始');
  save(); render();
}

// ─── 出牌（同时出）───
// phase = 'match_draw' 阶段可出牌
function playCard(cardId) {
  if (game.phase !== 'match' || game.match?.phase !== 'match_draw') return;
  const m = game.match;
  // 玩家选择这张牌
  m.aChoice = cardId;
  // AI 选牌
  const aiHand = m.bDraw.filter(id => !m.bPlayed.includes(id));
  const aiChoice = aiPickMatchCard(aiRng(), aiHand);
  m.bChoice = aiChoice;

  // 即时牌推进到对应分钟；修正牌进 pending（由 engine 统一处理 advanceToMinute 内播报）
  if (cardId) {
    const card = EVENT_BY_ID[cardId];
    if (card?.type === 'instant') {
      const targetMin = Math.min(card.minuteEnd || card.minute, 90);
      advanceToMinute(game, aiRng(), targetMin);
    } else if (card?.type === 'modifier') {
      m.aPending = m.aPending || [];
      m.aPending.push(card);
    }
  }
  if (aiChoice) {
    const card = EVENT_BY_ID[aiChoice];
    if (card?.type === 'instant') {
      const targetMin = Math.min(card.minuteEnd || card.minute, 90);
      advanceToMinute(game, aiRng(), targetMin);
    } else if (card?.type === 'modifier') {
      m.bPending = m.bPending || [];
      m.bPending.push(card);
    }
  }

  // 把已出牌压入已出列表（仅在 aChoice 仍有时）
  if (m.aChoice) m.aPlayed.push(m.aChoice);
  if (m.bChoice) m.bPlayed.push(m.bChoice);
  m.aChoice = null;
  m.bChoice = null;

  // engine.advanceToMinute 已经把 narrate 推入 importantEvents；这里只需要补玩家角度的"标识"
  // 用 'A' / 'B' 标识以和后端 / 在线对战对齐
  const playerCard = cardId ? EVENT_BY_ID[cardId] : null;
  const aiCard = aiChoice ? EVENT_BY_ID[aiChoice] : null;
  if (playerCard?.type === 'modifier' || aiCard?.type === 'modifier') {
    m.importantEvents = m.importantEvents || [];
    if (playerCard?.type === 'modifier') m.importantEvents.push({ tick: m.tickMinute, type: 'modifier_play', text: `你打出：${playerCard.emoji} ${playerCard.name}`, side: 'A', cardId: cardId });
    if (aiCard?.type === 'modifier') m.importantEvents.push({ tick: m.tickMinute, type: 'modifier_play', text: `AI 打出：${aiCard.emoji} ${aiCard.name}`, side: 'B', cardId: aiChoice });
  }

  // 比赛结束后自动结算
  if (m.tickMinute >= 90) {
    advanceToMinute(game, aiRng(), 90);
    finishMatch90(game);
    if (game.phase === 'penalty') {
      startPenaltyShootout(game, aiRng());
      game.phase = 'penalty';
    } else {
      resolveMatch90(game);
    }
    const record = buildHistoryRecord();
    storeHistory(record);
    localStorage.removeItem(ACTIVE_KEY);
    beep(game.result?.winner === 'PLAYER' ? 'win' : 'lose');
  }

  beep('select');
  save(); render();
}

// ─── 快进/推进（重要模式结束后自动继续）───
function advanceMatch() {
  if (!game.match) return;
  const m = game.match;
  // 快进 5 分钟并自动推进
  m.mode = 'fast';
  m.modeStartMin = m.tickMinute;

  const targetMin = Math.min(m.tickMinute + 5, 90);
  advanceToMinute(game, aiRng(), targetMin);
  m.tickMinute = targetMin;

  // 快进后看是否到 90 分钟
  if (m.tickMinute >= 90) {
    advanceToMinute(game, aiRng(), 90);
    finishMatch90(game);
    if (game.phase === 'penalty') {
      startPenaltyShootout(game, aiRng());
      game.phase = 'penalty';
    } else {
      resolveMatch90(game);
    }
    const record = buildHistoryRecord();
    storeHistory(record);
    localStorage.removeItem(ACTIVE_KEY);
    beep(game.result?.winner === 'PLAYER' ? 'win' : 'lose');
  }
  save(); render();
}

// ─── 90分钟比赛结束，进入点球 ──
function takePenalty() {
  startPenaltyShootout(game, aiRng());
  resolveMatch90(game);
  const record = buildHistoryRecord();
  storeHistory(record);
  localStorage.removeItem(ACTIVE_KEY);
  beep(game.result?.winner === 'PLAYER' ? 'win' : 'lose');
  save(); render();
}

function buildHistoryRecord() {
  const r = game.result;
  return {
    id: Date.now(),
    date: new Date().toISOString(),
    version: RULE_VERSION,
    seed: game.seed,
    settings: game.settings,
    winner: r.winner,
    ag: r.ag, bg: r.bg,
    penalty: r.penalty,
    metrics: r.metrics,
    mvp: r.mvpId,
    style: r.style,
    picks: clone(game.picks),
    lineup: clone(game.lineup),
    log: clone(game.log),
    snapshots: clone(game.snapshots),
    players: game.players.filter(p => [...game.picks.PLAYER, ...game.picks.AI].includes(p.id)),
  };
}
function setScreen(screen) { game ||= {}; game.screen=screen; render(); }
function reset() { clearTimeout(aiTimer); game=null; selectedId=null; localStorage.removeItem(ACTIVE_KEY); render(); }
function rematch() { const s={...game.settings}; newGame(s); }

function card(id, {disabled=false, selected=false, clickable=true} = {}) {
  const p = player(id);
  const pickDelta = (game && ['prePick','postPick'].includes(game.subPhase) && currentActor() === 'PLAYER' && !game.picks.PLAYER.includes(id))
    ? previewChemistryDelta('PLAYER', id)
    : null;
  const threat = (game?.subPhase === 'ban' && game.picks.PLAYER.length > 1)
    ? `化学预估 +${Math.max(0,Math.round(candidateThreat(id,'PLAYER','pick')-p.rating))}～+${Math.max(2,Math.round(candidateThreat(id,'PLAYER','pick')-p.rating)+3)}`
    : (pickDelta !== null ? `化学预估 ${pickDelta >= 0 ? '+' : ''}${pickDelta}` : '');
  return `<button class="player-card grade-${p.grade} ${disabled?'disabled':''} ${selected?'selected':''}" data-card="${id}" ${disabled||!clickable?'disabled':''}><span class="card-grade">${p.grade}</span><b class="card-rating">${p.rating}</b><span class="avatar">${esc((p.name||p.englishName).slice(0,1))}</span><strong>${esc(p.name)}</strong><small>${esc(p.englishName||'')}</small><div>${esc(p.club)} · ${esc(p.league)}</div><div>${esc(p.country)} · ${esc(p.detailedPosition||p.position)}</div>${threat?`<em>${threat}</em>`:''}</button>`;
}
function roster(side) {
  const picks = game.picks[side];
  const total = 10;
  const remaining = Math.max(0, total - (picks.length - 1));
  const assignment = assignToSlots(picks);
  const metrics = currentMetrics(side);
  const slots = side === 'AI' ? [...SLOT_ORDER].reverse() : SLOT_ORDER;
  const dirClass = side === 'AI' ? 'pitch-reverse' : '';
  return `<aside class="roster ${side.toLowerCase()}"><h3>${side==='PLAYER'?'你的阵容':'AI阵容'}</h3><div class="roster-score">当前纸面 ${currentPaper(side).toFixed(1)} · 化学 ${Math.round(metrics.chemistry)}</div><div class="pitch side-pitch ${dirClass}"><div class="pitch-half pitch-def"></div><div class="pitch-half pitch-mid"></div><div class="pitch-half pitch-att"></div><div class="pitch-center"></div>${slots.map(slot => {
    const pid = assignment[slot];
    if (!pid) return `<div class="pitch-slot slot-${slot.toLowerCase()} slot-empty"><div class="slot-pos">${SLOT_LABELS[slot]}</div><div class="slot-name">空位</div></div>`;
    const p = player(pid);
    return `<div class="pitch-slot slot-${slot.toLowerCase()}"><div class="slot-pos">${SLOT_LABELS[slot]}</div><div class="slot-name">${esc(p.name)}</div><div class="slot-meta"><span class="slot-rating">${p.rating}</span><span class="slot-fit">适配${Math.round(roleFit(p, slot) * 100)}%</span></div></div>`;
  }).join('')}</div><div class="roster-foot">${remaining > 0 ? `还差 <b>${remaining}</b> 名球员` : '阵容已满'}</div></aside>`;
}
function currentPaper(side) {
  const cards = game.picks[side].map(player);
  if (cards.length === 1) return 90;
  return cards.reduce((s,p) => s + p.rating, 0) / cards.length;
}
function bansPanel() {
  const row = side => {
    const items = game.bans[side].slice(-3).map((id, i) => {
      const p = player(id);
      return `<div class="ban-item"><span class="ban-idx">${i+1}</span><div class="ban-info"><b>${esc(p.name)}</b><small>${esc(p.club)} · ${esc(p.country)}</small></div><span class="ban-rating">${p.rating}</span></div>`;
    }).join('') || '<span class="ban-empty">暂无</span>';
    return `<div class="ban-row"><b>${side==='PLAYER'?'玩家禁用':'AI禁用'}</b>${items}</div>`;
  };
  return `<section class="ban-panel">${row('PLAYER')}${row('AI')}</section>`;
}
function header() {
  const roundInfo = game.rounds && game.rounds[game.round];
  const isMatch = ['tactical_pick','match','match_draw','match_important','reveal','penalty','result'].includes(game.phase);
  const phaseLabel = isMatch
    ? (game.phase === 'tactical_pick' ? '选择战术' : game.phase === 'match_draw' ? '出牌阶段' : game.phase === 'match_important' ? '重要时刻' : game.phase === 'penalty' ? '点球大战' : game.phase === 'result' ? '比赛结束' : '90分钟比赛')
    : (roundInfo ? POSITION_NAME[roundInfo.category] : '结算');
  const hint = isMatch ? (game.match ? `⏱ ${game.match.tickMinute}' / 90'` : '') : (roundInfo?.hint || '');
  const roundNo = Math.min((game.round || 0) + 1, (game.rounds?.length || 4));
  return `<header class="app-header"><div class="logo">DRAFT<span>XI</span></div><div class="round-meta">${isMatch ? phaseLabel : `第 ${roundNo} / ${game.rounds?.length || 4} 轮`} · ${phaseLabel} <small>${hint}</small></div><button class="ghost" data-home>退出</button></header>`;
}
function menu() { const active=localStorage.getItem(ACTIVE_KEY); return `<div class="landing"><div class="landing-copy"><span class="kicker">BAN · PICK · BUILD</span><h1>禁掉威胁<br><em>选出你的最强十一人</em></h1><p>四轮足球BP：前两轮16人双选、第三轮14人三选、终轮全明星各位置1人，每轮仅3次禁用。三局两胜，每场开赛前双方各抽一张随机事件卡——大乱斗一触即发。</p><div class="menu-actions"><button class="primary" data-new>开始人机对战</button><button class="accent" data-online>好友在线对战</button>${active?'<button data-resume>继续未完成对局</button>':''}<button data-history>最近20局</button><a href="legacy/index.html">旧经营模式</a></div></div><div class="hero-board"><div class="versus"><span>YOU</span><b>VS</b><span>AI / 好友</span></div><div class="rule-cards"><article><b>4</b><span>轮选秀</span></article><article><b>3</b><span>禁用/轮</span></article><article><b>11</b><span>最终阵容</span></article></div></div></div>`; }
function onlineLobby() { 
  const roomFromUrl=new URLSearchParams(location.search).get('room')||'';
  const serverUrl = window.WS_HOST ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.WS_HOST}` : location.origin;
  const resolvedHost = window.WS_HOST || '同源 (' + location.host + ')';
  return `<div class="online-lobby">
    <section>
      <span class="kicker">ONLINE FRIEND MATCH</span>
      <h1>好友在线对战</h1>
      <p>创建房间后将6位房间码或邀请链接发送给好友。服务器会权威裁定候选、禁选顺序和30秒倒计时。</p>
      
      <div class="online-section">
        <h3>第一步：设置昵称</h3>
        <label>你的昵称<input id="online-name" maxlength="16" value="${esc(online.nickname)}" placeholder="输入昵称"></label>
      </div>
      
      <div class="online-section">
        <h3>第二步：创建或加入房间</h3>
        <div class="online-actions">
          <button class="primary" data-create-room>创建房间</button>
          <span class="or-divider">或者</span>
          <input id="room-code" maxlength="6" value="${esc(roomFromUrl)}" placeholder="输入房间码">
          <button data-join-room>加入房间</button>
        </div>
      </div>
      
      <div class="server-info">
        <h3>服务器信息</h3>
        <p>当前 WS 服务器: <code>${esc(serverUrl)}</code></p>
        <p class="server-tip">确保好友也能访问此服务器地址（房间链接本身就是 Vercel 前端，WS 握手指向单独的 Render 后端）</p>
      </div>
      
      ${online.error?`<p class="online-error">⚠️ ${esc(online.error)}</p>`:''}
      
      <div class="online-back-row">
        <button data-online-back>返回主菜单</button>
      </div>
    </section>
    
    <aside>
      <h2>在线对战规则</h2>
      <div class="rule-item">
        <b>🎯 房间创建</b>
        <p>房主创建房间后获得6位房间码</p>
      </div>
      <div class="rule-item">
        <b>👥 邀请好友</b>
        <p>发送房间码或邀请链接给好友</p>
      </div>
      <div class="rule-item">
        <b>⏱️ 30秒限时</b>
        <p>每步操作限时30秒，超时自动执行</p>
      </div>
      <div class="rule-item">
        <b>🔄 断线重连</b>
        <p>掉线后房间保留90秒，可自动重连</p>
      </div>
      <div class="rule-item">
        <b>🔀 轮换先手</b>
        <p>每轮先禁权在房主和访客间交替</p>
      </div>
    </aside>
  </div>`; 
}
function setup() {
  return `<div class="setup-page"><section><span class="kicker">MATCH SETTINGS</span><h1>创建人机对局</h1><label>AI难度<select id="difficulty"><option value="easy">简单 · 30%失误</option><option value="normal" selected>普通 · 15%失误</option><option value="hard">困难 · 五步评估</option></select></label><label>AI性格<select id="personality"><option value="power">实力型</option><option value="chemistry">化学反应型</option><option value="counter">针对型</option></select></label><label>动画速度<select id="speed"><option value="fast">快速</option><option value="normal" selected>正常</option><option value="slow">慢速</option></select></label><label class="check"><input id="audio" type="checkbox" checked> 开启基础音效</label><button class="primary" data-start>进入BP</button><button data-cancel>返回</button></section><aside><h2>固定规则</h2><p>4-3-3 · 双方固定90分库尔图瓦</p><p>综合实力 = (纸面 + 化学) / 2</p><p>共4轮：前2轮双选16人 + 第3轮三选14人 + 终轮全明星混合14人</p><p>每轮仅3次禁用，玩家自由选择先选/后选</p><p>先选者获得先禁权</p><p>三局两胜，每场双方各抽1张随机事件卡</p></aside></div>`;
}
function orderScreen() {
  const roundInfo = game.rounds[game.round];
  const isDouble = roundInfo.type === 'double';
  const isMixed = roundInfo.category === 'MIXED';
  const desc = isMixed
    ? '全明星轮：14人混合卡池，你在后卫/中场/前锋各选1人（先各选1人 → 轮流禁用3次 → 再各选2人）。禁人时系统会保护各位置的供需平衡。先选者获得先禁权。'
    : isDouble
      ? '本轮双选：16人卡池，先各选1人 → 轮流禁用3次 → 再各选1人。先选者获得先禁权。'
      : '本轮三选：14人卡池，先各选1人 → 轮流禁用3次 → 再各选2人。先选者获得先禁权。';
  return `<div class="game">${header()}<main class="order-choice"><span class="kicker">ROUND ${game.round+1} · ${isMixed?'全明星':isDouble?'双选':'三选'}</span><h1>${POSITION_NAME[roundInfo.category]}轮 · 推荐${roundInfo.hint}</h1><p>${desc}</p><div class="choice-grid"><button data-order="PLAYER"><b>我要先选</b><span>优先拿到核心球员</span></button><button class="accent" data-order="AI"><b>我要后选</b><span>观察对手选择后应对</span></button></div><div class="fixed-gk">双方门将已锁定：蒂博·库尔图瓦 · 90</div></main></div>`;
}
function bpScreen() {
  const actor = currentActor();
  const roundInfo = game.rounds[game.round];
  const availIds = available(actor);
  const sub = game.subPhase;
  let title, desc;
  if (sub === 'prePick') {
    const taken = (game.prePicks || []).length;
    title = '初始选择';
    desc = `请选择你的核心球员（第${taken+1}/2人）${roundInfo.category==='MIXED'?' · 位置不可重复':''}`;
  } else if (sub === 'ban') {
    title = '禁用阶段';
    desc = `第${game.banTurn+1}/${BANS_PER_ROUND}禁用 · 阻止对手选到强力球员`;
  } else if (sub === 'postPick') {
    const taken = (game.postPicks || []).length;
    const total = roundInfo.type === 'triple' ? 4 : 2;
    title = '二次选择';
    desc = `请选择剩余强力球员（第${taken+1}/${total}人）${roundInfo.category==='MIXED'?' · 位置不可重复':''}`;
  }
  const actionText = (sub === 'prePick' || sub === 'postPick') ? '选择' : '禁用';
  return `<div class="game">${header()}<div class="bp-layout">${roster('PLAYER')}<main class="board"><div class="turn-banner ${actor?.toLowerCase()}"><b>${actor==='PLAYER'?'你的回合':'AI思考中'}</b><span>${title} · ${desc}</span></div>${bansPanel()}<div class="candidate-grid">${game.candidates.map(id => card(id, {disabled: !availIds.includes(id), selected: selectedId === id, clickable: actor === 'PLAYER'})).join('')}</div><footer><span>${selectedId ? `已选中：${esc(player(selectedId).name)}` : '先查看卡牌信息，再确认操作'}</span><button class="primary" data-confirm ${!selectedId || actor !== 'PLAYER' ? 'disabled' : ''}>确认${actionText}</button></footer></main>${roster('AI')}</div></div>`;
}
function summaryScreen() {
  const roundInfo = game.rounds[game.round];
  const isDouble = roundInfo.type === 'double';
  const isMixed = roundInfo.category === 'MIXED';
  const first = game.firstPicker || 'PLAYER';
  const other = first === 'PLAYER' ? 'AI' : 'PLAYER';
  const preP = (game.prePicks || []).map((id, i) => ({ actor: i === 0 ? first : other, id }));
  const postP = (game.postPicks || []).map((id, i) => ({ actor: i % 2 === 0 ? first : other, id }));
  const playerPicks = [...preP, ...postP].filter(x => x.actor === 'PLAYER').map(x => x.id);
  const aiPicks = [...preP, ...postP].filter(x => x.actor === 'AI').map(x => x.id);
  const cardList = ids => ids.map(id => card(id, {clickable: false})).join('');
  return `<div class="game">${header()}<main class="round-summary"><span class="kicker">ROUND COMPLETE</span><h1>第${game.round+1}轮选人完成${isMixed?'（全明星）':isDouble?'（双选）':'（三选）'}</h1><div class="duel-picks"><article><h3>你的选择</h3>${cardList(playerPicks)}</article><b>VS</b><article><h3>AI选择</h3>${cardList(aiPicks)}</article></div><div class="summary-stats"><span>你的纸面 ${currentPaper('PLAYER').toFixed(1)}</span><span>AI纸面 ${currentPaper('AI').toFixed(1)}</span><span>下一轮 ${game.round < game.rounds.length - 1 ? POSITION_NAME[game.rounds[game.round+1].category] : '阵容排布'}</span></div><button class="primary" data-next>${game.round < game.rounds.length - 1 ? '进入下一轮' : '进入阵容调整'}</button></main></div>`;
}
function pitch(side, direction = 'normal') {
  // direction: 'normal' (玩家：从下往上攻) 或 'reverse' (AI：从上往下攻)
  const assignment = game.lineup[side];
  const slots = direction === 'reverse' ? [...SLOT_ORDER].reverse() : SLOT_ORDER;
  const isPlayer = side === 'PLAYER';
  return `<div class="pitch pitch-${direction}${isPlayer ? ' pitch-player' : ' pitch-ai'}"><div class="pitch-half pitch-def"></div><div class="pitch-half pitch-mid"></div><div class="pitch-half pitch-att"></div><div class="pitch-center"></div>${slots.map(slot => {
    const p = player(assignment[slot]);
    return `<div class="pitch-slot slot-${slot.toLowerCase()}"><div class="slot-pos">${SLOT_LABELS[slot]}</div><div class="slot-name">${esc(p.name)}</div><div class="slot-meta"><span class="slot-rating">${p.rating}</span><span class="slot-fit">适配${Math.round(roleFit(p, slot) * 100)}%</span></div></div>`;
  }).join('')}</div>`;
}
function metricPanel(side) {
  const m = lineupMetrics(game.lineup[side]);
  return `<div class="metric-panel"><div><span>纸面实力</span><b>${m.paper.toFixed(1)}</b></div><div><span>化学反应</span><b>${m.chemistry.toFixed(1)}</b></div><div class="overall"><span>综合实力</span><b>${m.overall.toFixed(1)}</b></div><small>前锋 ${m.lines.FWD.toFixed(1)} · 中场 ${m.lines.MID.toFixed(1)} · 后卫 ${m.lines.DEF.toFixed(1)}</small></div>`;
}
function lineupScreen() {
  return `<div class="game">${header()}<main class="lineup-page"><div class="section-title"><div><span class="kicker">FINAL LINEUP</span><h1>两军对垒 · 4-3-3</h1><p>双方阵容已由系统自动排出最优布局。接下来选择战术风格，然后开始90分钟精彩对决！</p></div><button class="primary" data-start-match>确认阵容 · 选择战术风格</button></div><div class="lineup-compare"><section class="lineup-side lineup-player"><header><h2>玩家阵容</h2><span class="side-score">综合 ${lineupMetrics(game.lineup.PLAYER).overall.toFixed(1)}</span></header>${pitch('PLAYER', 'normal')}${metricPanel('PLAYER')}</section><section class="lineup-side lineup-ai"><header><h2>AI阵容</h2><span class="side-score">综合 ${lineupMetrics(game.lineup.AI).overall.toFixed(1)}</span></header>${pitch('AI', 'reverse')}${metricPanel('AI')}</section></div></main></div>`;
}
// ─── 战术风格选择（BP完成后，比赛前）───
function tacticalPickScreen() {
  const styles = TACTICAL_STYLES;
  const styleHTML = s => `
    <div class="tactical-style-card" data-style="${s.id}">
      <div class="style-emoji">${s.emoji}</div>
      <h3>${esc(s.name)}</h3>
      <p>${esc(s.desc)}</p>
      <div class="style-phases">
        ${s.phaseBonus.map(p => `<span>${p.start}-${p.end}分钟: 纸面+${p.selfPaper} 化学+${p.selfChem}</span>`).join('')}
      </div>
    </div>`;
  return `<div class="game">${header()}<main class="tactical-pick-page">
    <span class="kicker">TACTICAL STYLE</span>
    <h1>选择你的战术风格</h1>
    <p>比赛开始前选择你的主导战术。比赛中随时可以在界面上切换，不限次数。</p>
    <div class="style-grid">${styles.map(s => styleHTML(s)).join('')}</div>
  </main></div>`;
}

// ─── 90分钟比赛界面───
function match90Screen() {
  const m = game.match;
  if (!m) return menu();

  // 进度条
  const pct = Math.min(100, (m.tickMinute / 90) * 100);
  const modeIcon = m.mode === 'important' ? '⏱️' : '⚡';
  const modeLabel = m.mode === 'important' ? '重要' : '快进';
  const modeClass = m.mode === 'important' ? 'mode-important' : 'mode-fast';

  // 战术风格标签
  const aStyleName = m.aStyle ? (STYLE_BY_ID[m.aStyle]?.emoji || '') + ' ' + (STYLE_BY_ID[m.aStyle]?.name || '') : '未选择';
  const bStyleName = m.bStyle ? (STYLE_BY_ID[m.bStyle]?.emoji || '') + ' ' + (STYLE_BY_ID[m.bStyle]?.name || '') : '未选择';

  // 事件播报（最近5条）
  const recentEvents = (m.importantEvents || []).slice(-6).map(ev => {
    const cls = ev.side === 'PLAYER' ? 'ev-player' : 'ev-ai';
    return `<div class="event-broadcast ${cls}"><b>${ev.tick}'</b> ${esc(ev.text || '')}</div>`;
  }).join('');

  // 手牌（未打出的）
  const playerHand = (m.aDraw || []).filter(id => !(m.aPlayed || []).includes(id));
  const aiHand = (m.bDraw || []).filter(id => !(m.bPlayed || []).includes(id));

  const cardHTML = (id, opts = {}) => {
    const c = EVENT_BY_ID[id];
    if (!c) return '';
    const cls = `match-card ${c.type}${opts.chosen ? ' chosen' : ''}`;
    const typeLabel = c.type === 'instant' ? '即时' : '修正';
    const windowInfo = c.type === 'instant'
      ? `触发: ${c.minute}'`
      : `生效: ${c.windowStart}-${c.windowEnd}分钟`;
    return `<button class="${cls}" data-card="${id}" ${opts.clickable ? '' : 'disabled'}>
      <span class="mc-emoji">${c.emoji}</span>
      <b>${c.name}</b>
      <small>${typeLabel}</small>
      <small>${windowInfo}</small>
    </button>`;
  };

  const playerCards = playerHand.map(id => cardHTML(id, { clickable: m.phase === 'match_draw' })).join('');
  const aiCards = (aiHand.map(id => `<div class="match-card opponent-card face-down"><span>❓</span><b>未知</b></div>`)).join('');

  // 比分大字
  const scoreHTML = `<div class="match-score"><span class="score-side player">${m.ag}</span><span class="score-sep">:</span><span class="score-side ai">${m.bg}</span></div>`;

  // 当前操作区
  let actionHTML = '';
  if (m.phase === 'match_draw') {
    actionHTML = `<div class="match-action">
      <p class="action-hint">⚡ 选择一张手牌打出，或点击下方快进按钮跳过</p>
      <button class="primary" data-fast-forward>⚡ 快进 5 分钟（跳过出牌）</button>
    </div>`;
  } else if (m.phase === 'match_important') {
    actionHTML = `<div class="match-action">
      <button class="primary" data-match-continue>▶ 继续比赛</button>
    </div>`;
  }

  // 战术切换（始终可点）
  const styleSwitchHTML = TACTICAL_STYLES.map(s =>
    `<button class="style-switch-btn ${m.aStyle === s.id ? 'active' : ''}" data-switch-style="${s.id}">${s.emoji} ${s.name}</button>`
  ).join('');

  return `<div class="game">${header()}
    <div class="match90-layout">
      <div class="match-timeline-bar">
        <div class="time-progress" style="width:${pct}%"></div>
        <div class="time-labels">
          <span class="mode-badge ${modeClass}">${modeIcon} ${modeLabel}</span>
          <span class="time-display">${m.tickMinute}' / 90'</span>
        </div>
      </div>

      <div class="match-score-row">
        <div class="match-team player-team">
          <span class="team-name">你</span>
          <span class="team-style">${aStyleName}</span>
        </div>
        ${scoreHTML}
        <div class="match-team ai-team">
          <span class="team-style">${bStyleName}</span>
          <span class="team-name">AI</span>
        </div>
      </div>

      <div class="match-events-row">
        <div class="event-log">${recentEvents || '<span class="empty-log">比赛进行中...</span>'}</div>
      </div>

      <div class="match-cards-row">
        <section class="hand-section player-hand">
          <h4>你的手牌 <small>（${playerHand.length}张）</small></h4>
          <div class="hand-cards">${playerCards || '<span>无手牌</span>'}</div>
        </section>
        <section class="hand-section ai-hand">
          <h4>AI手牌 <small>（${aiHand.length}张）</small></h4>
          <div class="hand-cards">${aiCards}</div>
        </section>
      </div>

      <div class="match-style-row">
        <h4>战术风格（可随时切换）</h4>
        <div class="style-switcher">${styleSwitchHTML}</div>
      </div>

      <div class="match-action-row">${actionHTML}</div>
    </div>
  </main></div>`;
}

// ─── 点球大战界面───
function penaltyScreen() {
  const m = game.match;
  const p = m.penalty;
  if (!p) return match90Screen();

  const roundsHTML = p.rounds.map((r, i) => `
    <div class="penalty-round">
      <span class="pr-num">第${r.round}轮</span>
      <span class="pr-a ${r.aGoal === true ? 'goal' : r.aGoal === false ? 'miss' : 'pending'}">你 ${r.aGoal === true ? '✅' : r.aGoal === false ? '❌' : '⏳'}</span>
      <span class="pr-b ${r.bGoal === true ? 'goal' : r.bGoal === false ? 'miss' : 'pending'}">AI ${r.bGoal === true ? '✅' : r.bGoal === false ? '❌' : '⏳'}</span>
    </div>`).join('');

  const winnerName = p.winner === 'PLAYER' ? '你' : 'AI';
  return `<div class="game">${header()}<main class="penalty-page">
    <span class="kicker">PENALTY SHOOTOUT</span>
    <h1>⚽ 点球大战</h1>
    <div class="penalty-score"><b>${p.aScore}</b><span> : </span><b>${p.bScore}</b></div>
    <div class="penalty-rounds">${roundsHTML}</div>
    <p class="penalty-result">${winnerName}赢得了点球大战！</p>
    <div class="menu-actions">
      <button class="primary" data-view-result>查看比赛结果</button>
      <button class="primary" data-rematch>再来一局</button>
      <button data-home>返回主菜单</button>
    </div>
  </main></div>`;
}

// ─── 最终结果界面───
function resultScreen() {
  const r = game.result;
  if (!r) return menu();
  const win = r.winner === 'PLAYER';
  const scoreLabel = `${r.ag} : ${r.bg}`;
  const penaltyNote = r.penalty ? `（点球 ${r.penalty.aScore}-${r.penalty.bScore}）` : '';
  const styleNote = r.style ? `${STYLE_BY_ID[r.style?.A]?.emoji || ''} vs ${STYLE_BY_ID[r.style?.B]?.emoji || ''}` : '';
  const eventsNote = (r.importantEvents || []).length
    ? r.importantEvents.slice(-5).map(ev => `${ev.tick}' ${ev.text}`).join(' / ')
    : '无重要事件';

  return `<div class="game result-page">${header()}<main>
    <span class="kicker">FULL TIME</span>
    <h1>${win ? '你赢得了比赛！' : 'AI赢得了比赛'}</h1>
    <div class="final-score"><b>${scoreLabel}</b>${penaltyNote ? `<small>${penaltyNote}</small>` : ''}</div>
    <div class="result-teams">
      <div class="result-team"><span>${STYLE_BY_ID[r.style?.A]?.emoji || '🏃'} 你</span><span>${STYLE_BY_ID[r.style?.A]?.name || ''}</span></div>
      <div class="result-team"><span>${STYLE_BY_ID[r.style?.B]?.emoji || '🤖'} AI</span><span>${STYLE_BY_ID[r.style?.B]?.name || ''}</span></div>
    </div>
    <div class="result-metrics">${metricPanel('PLAYER')}${metricPanel('AI')}</div>
    <div class="result-events"><h4>精彩瞬间</h4><p>${esc(eventsNote)}</p></div>
    ${r.mvpId ? `<div class="mvp">本场MVP <strong>${esc(nameZh(player(r.mvpId)))}</strong></div>` : ''}
    <div class="menu-actions">
      <button class="primary" data-rematch>再来一局</button>
      <button data-lineups>查看阵容</button>
      <button data-replay>查看BP回放</button>
      <button data-home>返回主菜单</button>
    </div>
  </main></div>`;
}
function historyScreen() { const list=histories(); return `<div class="history-page"><header><h1>最近20局</h1><button data-home>返回</button></header>${list.length?list.map((r,i)=>`<article><div><b>${r.winner==='PLAYER'?'胜利':'失败'} ${r.pw}:${r.aw}</b><span>${new Date(r.date).toLocaleString()}</span></div><div>玩家 ${r.metrics.PLAYER.overall.toFixed(1)} · AI ${r.metrics.AI.overall.toFixed(1)}</div><button data-history-replay="${i}">逐步回放</button></article>`).join(''):'<p class="empty">暂无完成的对局</p>'}</div>`; }
function replayScreen() { const record=game.replayRecord, step=game.replayStep||0, snap=record.snapshots[step]; return `<div class="replay-page"><header><h1>BP逐步回放</h1><button data-home>返回</button></header><div class="replay-progress">${step+1} / ${record.snapshots.length} · ${esc(snap.label)}</div><div class="replay-columns"><section><h2>玩家阵容</h2>${snap.picks.PLAYER.map(id=>`<p>${esc(id==='shared_courtois'?'蒂博·库尔图瓦':nameZh(record.players.find(p=>p.id===id)||{name:id}))}</p>`).join('')}</section><section><h2>当轮候选</h2>${snap.candidates.map(id=>`<span>${esc(nameZh(record.players.find(p=>p.id===id)||{name:id}))}</span>`).join('')}</section><section><h2>AI阵容</h2>${snap.picks.AI.map(id=>`<p>${esc(id==='shared_courtois'?'蒂博·库尔图瓦':nameZh(record.players.find(p=>p.id===id)||{name:id}))}</p>`).join('')}</section></div><div class="replay-controls"><button data-step="-1" ${step===0?'disabled':''}>上一步</button><button data-step="1" ${step>=record.snapshots.length-1?'disabled':''}>下一步</button></div></div>`; }
function onlinePlayer(id){return id===COURTOIS.id?COURTOIS:NORMALIZED_PLAYER_MAP.get(id);}
function onlineAssignment(ids){
  const cards=ids.map(onlinePlayer).filter(Boolean),result={GK:COURTOIS.id},used=new Set([COURTOIS.id]);
  const groups={FWD:['LW','ST','RW'],MID:['CM1','CDM','CM2'],DEF:['LB','CB1','CB2','RB']};
  for(const [line,slots] of Object.entries(groups)){
    const remaining=cards.filter(p=>p.position===line&&!used.has(p.id));
    for(const slot of slots){if(!remaining.length)break;const best=remaining.map((p,i)=>({i,v:p.rating*roleFit(p,slot)})).sort((a,b)=>b.v-a.v)[0];const [picked]=remaining.splice(best.i,1);result[slot]=picked.id;used.add(picked.id);}
  }
  const remaining=cards.filter(p=>!used.has(p.id));
  for(const slot of SLOT_ORDER.filter(s=>s!=='GK'&&!result[s])){if(!remaining.length)break;const best=remaining.map((p,i)=>({i,v:p.rating*roleFit(p,slot)})).sort((a,b)=>b.v-a.v)[0];const [picked]=remaining.splice(best.i,1);result[slot]=picked.id;used.add(picked.id);}
  return result;
}
function onlinePaper(ids){const cards=ids.map(onlinePlayer).filter(Boolean);return cards.length?cards.reduce((sum,p)=>sum+p.rating,0)/cards.length:0;}
function onlineMetrics(ids){
  const assignment=onlineAssignment(ids),entries=SLOT_ORDER.map(slot=>({slot,p:onlinePlayer(assignment[slot]),fit:roleFit(onlinePlayer(assignment[slot]),slot)}));
  const lineAverage=line=>{const rows=entries.filter(x=>x.p?.position===line);return rows.length?rows.reduce((sum,x)=>sum+x.p.rating*x.fit,0)/rows.length:0;};
  const paper=lineAverage('GK')*.1+lineAverage('DEF')*.3+lineAverage('MID')*.3+lineAverage('FWD')*.3;
  const nonGk=entries.filter(x=>x.slot!=='GK'&&x.p);const slotFit=nonGk.length>0?(nonGk.reduce((sum,x)=>sum+x.fit,0)/Math.min(nonGk.length,10))*32:0;
  const roles={FWD:['LW','ST','RW'],MID:['CM1','CDM','CM2'],DEF:['LB','CB1','CB2','RB']};let template=0;Object.values(roles).forEach(slots=>{if(slots.every(slot=>assignment[slot]&&roleFit(onlinePlayer(assignment[slot]),slot)>=.96))template+=8/3;});
  const groupScore=(field,thresholds,cap)=>{const counts={};nonGk.forEach(x=>counts[x.p[field]]=(counts[x.p[field]]||0)+1);let total=0;Object.values(counts).forEach(n=>{let best=0;thresholds.forEach(([need,score])=>{if(n>=need)best=score;});total+=best;});return Math.min(cap,total);};
  const club=groupScore('club',[[2,4],[3,8],[4,12]],20),league=groupScore('league',[[2,3],[4,7],[6,11]],15),nation=groupScore('country',[[2,3],[3,6],[5,10]],15);const ratings=nonGk.map(x=>x.p.rating);const leaders=Math.min(6,ratings.filter(r=>r>=85).length*2);const gap=ratings.length?Math.max(...ratings)-Math.min(...ratings):99;const balance=gap<=8?4:gap<=12?3:gap<=16?2:gap<=20?1:0;const chemistry=Math.min(100,slotFit+template+club+league+nation+leaders+balance);
  return {paper,chemistry,overall:(paper+chemistry)/2,lines:{FWD:lineAverage('FWD'),MID:lineAverage('MID'),DEF:lineAverage('DEF')}};
}
function onlineChemistryEstimate(id,ownIds){const candidate=onlinePlayer(id);const links=ownIds.map(onlinePlayer).filter(p=>p&&p.id!==COURTOIS.id).reduce((sum,p)=>sum+(p.club===candidate.club?5:0)+(p.league===candidate.league&&p.club!==candidate.club?2:0)+(p.country===candidate.country&&p.club!==candidate.club?3:0),0);return [Math.max(0,links-2),links+3];}
function onlineCard(id,{disabled=false,selected=false,clickable=true,ownIds=[]}={}){const p=onlinePlayer(id);if(!p)return '';const [low,high]=onlineChemistryEstimate(id,ownIds);return `<button class="player-card grade-${p.grade||'B'} ${disabled?'disabled':''} ${selected?'selected':''}" data-online-card="${id}" ${disabled||!clickable?'disabled':''}><span class="card-grade">${p.grade||'B'}</span><b class="card-rating">${p.rating}</b><span class="avatar">${esc(p.name.slice(0,1))}</span><strong>${esc(p.name)}</strong><small>${esc(p.englishName||'')}</small><div>${esc(p.club)} · ${esc(p.league)}</div><div>${esc(p.country)} · ${esc(p.detailedPosition||p.position)}</div><em>化学预估 +${low}～+${high}</em></button>`;}
function onlinePitch(ids,reverse=false){const assignment=onlineAssignment(ids),slots=reverse?[...SLOT_ORDER].reverse():SLOT_ORDER;return `<div class="pitch side-pitch ${reverse?'pitch-reverse':''}"><div class="pitch-half pitch-def"></div><div class="pitch-half pitch-mid"></div><div class="pitch-half pitch-att"></div><div class="pitch-center"></div>${slots.map(slot=>{const id=assignment[slot];if(!id)return `<div class="pitch-slot slot-${slot.toLowerCase()} slot-empty"><div class="slot-pos">${SLOT_LABELS[slot]}</div><div class="slot-name">空位</div></div>`;const p=onlinePlayer(id);return `<div class="pitch-slot slot-${slot.toLowerCase()}"><div class="slot-pos">${SLOT_LABELS[slot]}</div><div class="slot-name">${esc(p.name)}</div><div class="slot-meta"><span class="slot-rating">${p.rating}</span><span class="slot-fit">适配${Math.round(roleFit(p,slot)*100)}%</span></div></div>`;}).join('')}</div>`;}
function onlineRoster(side,m,players,reverse=side==='B'){const ids=m.picks[side]||[COURTOIS.id],remaining=Math.max(0,10-(ids.length-1));return `<aside class="roster ${side.toLowerCase()}"><h3>${esc(players[side]?.nickname||`玩家${side}`)}${side===m.viewer?'（你）':''}</h3><div class="roster-score">当前纸面 ${onlinePaper(ids).toFixed(1)}</div>${onlinePitch(ids,reverse)}<div class="roster-foot">${remaining?`还差 <b>${remaining}</b> 名球员`:'阵容已满'}</div></aside>`;}
function onlineMetricPanel(ids){const m=onlineMetrics(ids);return `<div class="metric-panel"><div><span>纸面实力</span><b>${m.paper.toFixed(1)}</b></div><div><span>化学反应</span><b>${m.chemistry.toFixed(1)}</b></div><div class="overall"><span>综合实力</span><b>${m.overall.toFixed(1)}</b></div><small>前锋 ${m.lines.FWD.toFixed(1)} · 中场 ${m.lines.MID.toFixed(1)} · 后卫 ${m.lines.DEF.toFixed(1)}</small></div>`;}
function onlineSend(type,payload={}){online.client?.send(type,payload);}
function onlineConnect(action,payload){
  online.error='';
  const client=new OnlineClient({
    session:({code, side})=>{
      online.invite=`${location.origin}${location.pathname}?room=${code}`;
      // SESSION 消息先于 STATE 到达，此时只更新邀请链接和简化 state，
      // 真正的渲染由 STATE 消息触发，避免用不完整 state 渲染
      online.state = online.state && online.state.code === code
        ? { ...online.state, code, you: side }
        : { code, you: side, status: 'lobby', players: { A: { connected: true, side: 'A', nickname: online.nickname }, B: null } };
      history.replaceState(null,'',`?room=${code}`);
      // SESSION 到达时也强制 render 一次，让用户看到等待页（即便 STATE 还没到）
      if (game?.screen !== 'online-room') {
        game = { screen: 'online-room' };
        render();
      }
    },
    state:(state)=>{
      const ownPicks = state.game?.picks?.[state.you] || [];
      const added = ownPicks.find(id => id !== COURTOIS.id && !online.lastOwnPicks.includes(id));
      online.state = state;
      online.lastOwnPicks = [...ownPicks];
      game={screen:'online-room'};
      render();
      if(added){const existing=ownPicks.filter(id=>id!==added&&id!==COURTOIS.id);const combo=findChemistryCombo(added,existing,onlinePlayer);if(combo)requestAnimationFrame(()=>setTimeout(()=>triggerChemistryAnimation(combo,onlinePlayer),80));}
    },
    error:(message)=>{
      online.error=message;
      render();
    },
    close:()=>{
      if(game?.screen==='online-room'){
        online.error='连接已断开，正在等待重连';
        render();
        setTimeout(()=>{
          online.client?.connect().then(()=>online.client.reconnect()).catch(()=>{});
        },1500);
      }
    }
  });
  online.client=client;
  client.connect().then(()=>{
    if(action==='CREATE') client.create(payload.nickname);
    else if(action==='JOIN') client.join(payload.code, payload.nickname);
    else client.reconnect();
  }).catch((err)=>{
    console.error('[onlineConnect] failed:', err);
    online.error=`无法连接服务器：${err?.message || err}。请确认后端服务已启动（本地：npm start；部署：检查 Render/Vercel 端口和 WS_HOST 配置）`;
    render();
  });
}
function onlineRoom(){
  const state = online.state;
  if(!state) return onlineLobby();
  const room = state;
  const m = state.game;
  const you = state.you;
  const players = state.players;
  const enemySide = you === 'A' ? 'B' : 'A';
  const roundsTotal = 4;
  const deadline = state.deadline ? Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)) : 0;
  const phaseLabel = m ? (
    m.phase === 'ORDER' ? '选择本轮先后手' :
    m.phase === 'PRE_PICK' ? '本轮先选 1 人' :
    m.phase === 'BAN' ? `禁用阶段 · ${m.banCount || 0}/6` :
    m.phase === 'POST_PICK' ? '再选' :
    m.phase === 'PICK' ? '选人' :
    m.phase === 'ROUND_END' ? '本轮完成' :
    m.phase === 'LINEUP' ? '确认阵容' :
    m.phase === 'EVENT' ? '事件卡抽卡' :
    m.phase === 'MATCH' ? '比赛进行中' :
    m.phase === 'RESULT' ? '比赛结束' : '进行中'
  ) : '';
  const onlineHeader = `<header class="app-header"><div class="logo">ONLINE<span>XI</span></div><div class="round-meta">房间 ${room.code}${m ? ` · 第 ${Math.min(m.round + 1, roundsTotal)} / ${roundsTotal} 轮 · ${phaseLabel} <small>${m.roundType === 'double' ? '双选' : '三选'} · ${esc(m.roundHint || '')} · ${deadline}秒</small>` : ''}</div><button data-online-leave>退出</button></header>`;

  // 等待好友加入界面
  if(!m) {
    const roomUrl = `${location.origin}${location.pathname}?room=${room.code}`;
    return `<div class="online-wait">
      <div class="wait-header"><span class="kicker">ROOM ${room.code}</span><h1>等待好友加入</h1></div>
      <div class="room-code-display"><div class="room-code-label">房间码</div><div class="room-code-number">${room.code.split('').join(' ')}</div></div>
      <div class="invite-section">
        <p class="invite-tip">复制以下链接发送给好友，好友可直接加入：</p>
        <div class="invite-link-box">
          <input readonly value="${esc(roomUrl)}" id="invite-link">
          <button class="primary" data-copy-link>复制链接</button>
        </div>
      </div>
      <div class="players-status">
        <div class="player-status ${players.A?.connected ? 'connected' : 'waiting'}">
          <span class="status-dot"></span><span class="player-name">${esc(players.A?.nickname || '房主')}</span>
          <span class="player-role">房主${you === 'A' ? ' · 你' : ''}</span>
        </div>
        ${players.B ? `<div class="player-status ${players.B.connected ? 'connected' : 'waiting'}"><span class="status-dot"></span><span class="player-name">${esc(players.B.nickname)}</span><span class="player-role">访客</span></div>` : `<div class="player-status waiting"><span class="status-dot blink"></span><span class="player-name">等待加入...</span></div>`}
      </div>
      <div class="wait-actions">
        ${players.B
          ? (room.status === 'lobby'
              ? '<p class="opponent-joined">好友已加入 · 即将开始…</p>'
              : '<p class="opponent-joined">对局进行中</p>')
          : ''}
        <button data-online-leave>离开房间</button>
      </div>
    </div>`;
  }

  // RESULT：BO3 最终结果
  if (m.phase === 'RESULT') {
    const r = m.result || {};
    const winner = r.winner;
    const winLine = winner === you ? '你赢得了对局' : winner ? `${esc(players[winner]?.nickname || '对手')}赢得了对局` : (r.forfeit ? `${esc(players[r.forfeit.loser]?.nickname||'')}断线超时，${esc(players[r.forfeit.winner]?.nickname||'')}获胜` : '对局结束');
    const aWin = r.aWins ?? 0;
    const bWin = r.bWins ?? 0;
    const myWin = winner === you;
    return `<div class="game result-page">${onlineHeader}<main><span class="kicker">BEST OF THREE</span><h1>${esc(winLine)}</h1><div class="series-score"><b>${aWin}</b><span>:</span><b>${bWin}</b></div><div class="matches">${(r.matches || []).map((mt, i) => {
      const ac = EVENT_BY_ID[mt.events?.A], bc = EVENT_BY_ID[mt.events?.B];
      return `<article><small>第${i + 1}场 · ${esc(mt.venue || '')}${mt.forfeit ? ' · 腰斩' : ''}</small><strong>${mt.ag} : ${mt.bg}</strong>${mt.events ? `<em>${ac?.emoji || '⚽'} vs ${bc?.emoji || '⚽'}</em>` : ''}</article>`;
    }).join('')}</div><div class="result-metrics">${onlineMetricPanel(m.picks.A || [])}${onlineMetricPanel(m.picks.B || [])}</div><div class="mvp">${r.mvpId ? `本局MVP <strong>${esc(nameZh(onlinePlayer(r.mvpId)))}</strong>` : ''}</div><div class="menu-actions"><button class="primary" data-online-rematch>再来一局</button><button data-online-leave>返回主菜单</button></div></main></div>`;
  }

  // LINEUP：双方阵容对比
  if (m.phase === 'LINEUP') {
    const youReady = players[you]?.lineupReady;
    return `<div class="game">${onlineHeader}<main class="lineup-page"><div class="section-title"><div><span class="kicker">最终阵容</span><h1>两军对垒 · 4-3-3</h1><p>双方阵容已自动排出最优布局。三局两胜，每场双方各抽 1 张随机事件卡。</p></div><button class="primary" data-online-lineup-ready ${youReady ? 'disabled' : ''}>${youReady ? '已确认 · 等待对手' : '确认阵容并开始抽事件卡'}</button></div><div class="lineup-compare"><section class="lineup-side lineup-player"><header><h2>${esc(players.A?.nickname || '玩家A')}阵容</h2><span class="side-score">综合 ${onlineMetrics(m.picks.A || []).overall.toFixed(1)}</span></header>${onlinePitch(m.picks.A || [], false)}${onlineMetricPanel(m.picks.A || [])}</section><section class="lineup-side lineup-ai"><header><h2>${esc(players.B?.nickname || '玩家B')}阵容</h2><span class="side-score">综合 ${onlineMetrics(m.picks.B || []).overall.toFixed(1)}</span></header>${onlinePitch(m.picks.B || [], true)}${onlineMetricPanel(m.picks.B || [])}</section></div></main></div>`;
  }

  // EVENT：BO3 事件卡抽卡
  if (m.phase === 'EVENT') {
    const s = m.series;
    const myDraw = you === 'A' ? s.aDraw : s.bDraw;
    const enemyDraw = you === 'A' ? s.bDraw : s.aDraw;
    const myChoice = you === 'A' ? s.aChoice : s.bChoice;
    const enemyChoice = you === 'A' ? s.bChoice : s.aChoice;
    const faceUp = s.stage === 'reveal';
    const venue = s.matchIndex === 0 ? 'A 主场' : s.matchIndex === 1 ? 'B 主场' : '中立场';
    const card = (id, opts = {}) => {
      const c = EVENT_BY_ID[id];
      if (!c) return '';
      const cls = `event-card ${c.type}${opts.chosen ? ' chosen' : ''}${opts.faceDown ? ' face-down' : ''}`;
      return `<button class="${cls}" data-online-event-card="${id}" ${opts.clickable ? '' : 'disabled'}><span class="ec-emoji">${c.emoji}</span><b>${c.name}</b><small>${EVENT_TYPE_NAME[c.type]}</small><p>${c.desc}</p></button>`;
    };
    const yourCards = (myDraw || []).map(id => card(id, { chosen: myChoice === id, clickable: s.stage === 'draw' })).join('');
    const aiCards = (enemyDraw || []).map(id => card(id, { faceDown: !(faceUp && enemyChoice === id), chosen: enemyChoice === id })).join('');
    const title = s.stage === 'draw' ? '抽一张事件卡' : '双方事件揭晓';
    const hint = s.stage === 'draw' ? '从三张卡中选一张，将在本场比赛生效。' : 'AI 也做出了选择。开球看看会发生什么！';
    return `<div class="game">${onlineHeader}<main class="event-page"><span class="kicker">EVENT DRAW · MATCH ${s.matchIndex + 1} · ${esc(venue)}</span><h1>${title}</h1><p>${hint}</p><section class="event-row"><h3>你的手牌</h3><div class="event-cards">${yourCards}</div></section><section class="event-row"><h3>对手的手牌</h3><div class="event-cards">${aiCards}</div></section>${faceUp ? `<button class="primary" data-online-play-match>开球 · 第${s.matchIndex + 1}场</button>` : ''}</main></div>`;
  }

  // MATCH：单场比赛结果
  if (m.phase === 'MATCH') {
    const s = m.series;
    const mt = s.matches[s.matches.length - 1];
    const ac = EVENT_BY_ID[mt.events?.A], bc = EVENT_BY_ID[mt.events?.B];
    const finished = (s.aWins >= 2 || s.bWins >= 2 || s.matches.length >= 3);
    return `<div class="game">${onlineHeader}<main class="match-page"><span class="kicker">MATCH ${s.matches.length} · ${esc(mt.venue || '')}${mt.forfeit ? ' · 腰斩' : ''}</span><h1>${mt.forfeit ? '比赛腰斩！' : `${mt.ag} : ${mt.bg}`}</h1>${mt.forfeit ? '<p class="event-pending">球迷冲入场内，比赛腰斩，随机一方被判 0-3 负。</p>' : ''}<div class="match-events"><span>${esc(players.A?.nickname || 'A')} ${ac?.emoji || '⚽'} ${ac?.name || ''}</span><b>VS</b><span>${esc(players.B?.nickname || 'B')} ${bc?.emoji || '⚽'} ${bc?.name || ''}</span></div><div class="series-track">大比分 ${s.aWins} : ${s.bWins}</div><button class="primary" data-online-next-match>${finished ? '查看最终结果' : '下一场 · 抽事件卡'}</button></main></div>`;
  }

  // ROUND_END：双方都点继续
  if (m.phase === 'ROUND_END') {
    const myReady = state.continueReady?.[you];
    const enemyReady = state.continueReady?.[enemySide];
    const roundPickIds = side => [...(m.prePicks || []), ...(m.postPicks || [])].filter(id => (m.pickOwners || {})[id] === side);
    const mine = roundPickIds(you);
    const enemy = roundPickIds(enemySide);
    const isMixed = m.rounds[m.round]?.category === 'MIXED';
    const isDouble = m.rounds[m.round]?.type === 'double';
    return `<div class="game">${onlineHeader}<main class="round-summary"><span class="kicker">本轮完成</span><h1>第${m.round + 1}轮选人完成${isMixed ? '（全明星）' : isDouble ? '（双选）' : '（三选）'}</h1><div class="duel-picks"><article><h3>你的选择</h3>${mine.map(id => onlineCard(id, { clickable: false })).join('')}</article><b>VS</b><article><h3>对手选择</h3>${enemy.map(id => onlineCard(id, { clickable: false })).join('')}</article></div><div class="summary-stats"><span>你的纸面 ${onlinePaper(m.picks[you] || []).toFixed(1)}</span><span>对手纸面 ${onlinePaper(m.picks[enemySide] || []).toFixed(1)}</span><span>${m.round < roundsTotal - 1 ? `下一轮 ${POSITION_NAME[m.rounds[m.round + 1].category] || ''}` : '阵容排布'}</span></div><button class="primary" data-online-next ${myReady ? 'disabled' : ''}>${myReady ? '已确认 · 等待对手' : (enemyReady ? '确认进入下一轮' : '确认并继续')}</button><p>双方确认后进入下一轮</p></main></div>`;
  }

  // BP 阶段（ORDER / PRE_PICK / BAN / POST_PICK / PICK）
  const removed = new Set([
    ...((m.roundBans || []).map(x => x.id)),
    ...(m.prePicks || []),
    ...(m.postPicks || []),
  ]);
  const availableIds = (m.candidates || []).filter(id => !removed.has(id));
  const cards = (m.candidates || []).map(id => onlineCard(id, { disabled: !availableIds.includes(id), selected: selectedId === id, clickable: m.activeSide === you, ownIds: m.picks[you] || [] })).join('');

  const activeSideName = m.phase === 'ORDER' ? state.choiceOwner : m.activeSide;
  const isYourTurn = activeSideName === you;
  const pickPhase = m.phase === 'PRE_PICK' || m.phase === 'POST_PICK' || m.phase === 'PICK';
  const confirmText = m.phase === 'BAN' ? '禁用' : '选择';
  const actionType = m.phase === 'BAN' ? 'BAN' : (m.phase === 'PRE_PICK' ? 'PRE_PICK' : 'POST_PICK');
  const rosterOnline = (side, reverse = false) => onlineRoster(side, { ...m, viewer: you }, players, reverse);
  const roundPickIds = side => [...(m.prePicks || []), ...(m.postPicks || [])].filter(id => (m.pickOwners || {})[id] === side);

  return `<div class="game">${onlineHeader}<div class="bp-layout">${rosterOnline(you, false)}<main class="board"><div class="turn-banner ${isYourTurn ? 'player' : 'ai'}"><b>${isYourTurn ? '你的回合' : '等待对方'}</b><span>${phaseLabel}</span></div>${m.phase === 'ORDER' && isYourTurn ? `<div class="choice-grid online-choice"><button data-online-order="first">我先选</button><button class="accent" data-online-order="last">我后选</button></div>` : ''}<section class="ban-panel"><div class="ban-row"><b>你方禁用</b>${(m.roundBans || []).filter(item => item.side === you).map((item, i) => { const p = onlinePlayer(item.id); return `<div class="ban-item"><span class="ban-idx">${i + 1}</span><div class="ban-info"><b>${esc(p?.name || item.id)}</b><small>${esc(p?.club || '')} · ${esc(p?.country || '')}</small></div><span class="ban-rating">${p?.rating || ''}</span></div>`; }).join('') || '<span class="ban-empty">暂无</span>'}</div><div class="ban-row"><b>对手禁用</b>${(m.roundBans || []).filter(item => item.side !== you).map((item, i) => { const p = onlinePlayer(item.id); return `<div class="ban-item"><span class="ban-idx">${i + 1}</span><div class="ban-info"><b>${esc(p?.name || item.id)}</b><small>${esc(p?.club || '')} · ${esc(p?.country || '')}</small></div><span class="ban-rating">${p?.rating || ''}</span></div>`; }).join('') || '<span class="ban-empty">暂无</span>'}</div></section><div class="candidate-grid">${cards}</div>${(m.phase === 'BAN' || pickPhase) && isYourTurn ? `<footer><span>${selectedId ? esc(nameZh(onlinePlayer(selectedId))) : '请选择球员'}</span><button class="primary" data-online-confirm ${!selectedId ? 'disabled' : ''}>确认${confirmText}</button></footer>` : ''}</main>${rosterOnline(enemySide, true)}</div></div>`;
}
function render() {
  clearTimeout(aiTimer);
  if (!game) { app.innerHTML = menu(); bind(); return; }
  // 状态校验：当前对局阶段缺失必要字段时回到主菜单，避免页面卡死
  const needsRounds = ['order','ban','postPick','prePick','summary','lineup','tactical_pick','match','match_draw','match_important','reveal','finished','penalty','result'].includes(game.phase);
  if (needsRounds && (!Array.isArray(game.rounds) || !Number.isInteger(game.round))) {
    console.warn('[render] game state incomplete, resetting', { phase: game.phase, rounds: game.rounds, round: game.round });
    localStorage.removeItem(ACTIVE_KEY);
    game = null;
    app.innerHTML = menu();
    bind();
    return;
  }
  // 状态自愈 1: banTurn 与 roundBans.length 不一致时强制对齐
  if (Array.isArray(game.roundBans) && typeof game.banTurn === 'number') {
    if (game.roundBans.length !== game.banTurn) {
      console.warn('[render] banTurn/roundBans desynced', { banTurn: game.banTurn, len: game.roundBans.length });
      game.banTurn = game.roundBans.length;
    }
  }
  // 状态自愈 2: 阵容已满但轮未走完，自动跳到阵容排布
  if (game.picks && Array.isArray(game.rounds) && Number.isInteger(game.round)) {
    const playerFull = (game.picks.PLAYER?.length || 0) >= 11;
    const aiFull = (game.picks.AI?.length || 0) >= 11;
    if ((playerFull && aiFull) && !['lineup','tactical_pick','match','match_draw','match_important','reveal','penalty','result'].includes(game.phase)) {
      console.warn('[render] both lineups full but phase is', game.phase, '-> auto-finalize');
      try {
        finalizeLineups();
      } catch (e) {
        console.error('[render] finalizeLineups failed:', e);
        // bestAssignment 抛错时仍强制推进到 lineup 阶段，避免 UI 卡住
        game.phase = 'lineup';
        game.screen = 'lineup';
        // 同时维护 PLAYER/AI 和 A/B 两套键名（A/B 是 engine.js 比赛逻辑用的）
        for (const side of ['PLAYER', 'AI']) {
          const other = side === 'PLAYER' ? 'A' : 'B';
          game.lineup[side] = game.lineup[side] || { GK: COURTOIS.id };
          game.lineup[other] = game.lineup[other] || { GK: COURTOIS.id };
        }
        for (const side of ['PLAYER', 'AI']) {
          if (!game.lineup[side].GK) game.lineup[side].GK = COURTOIS.id;
        }
        for (const slot of SLOT_ORDER) {
          if (!game.lineup.PLAYER[slot]) game.lineup.PLAYER[slot] = game.picks.PLAYER[0] || COURTOIS.id;
          if (!game.lineup.AI[slot]) game.lineup.AI[slot] = game.picks.AI[0] || COURTOIS.id;
          // 镜像到 A/B 供 engine.js 比赛逻辑使用
          game.lineup.A = game.lineup.A || {};
          game.lineup.B = game.lineup.B || {};
          if (!game.lineup.A[slot]) game.lineup.A[slot] = game.lineup.PLAYER[slot];
          if (!game.lineup.B[slot]) game.lineup.B[slot] = game.lineup.AI[slot];
        }
        save();
      }
      // 不 return，继续渲染 lineupScreen
    }
  }
  let html;
  if (game.screen === 'online-lobby') html = onlineLobby();
  else if (game.screen === 'online-room') html = onlineRoom();
  else if (game.screen === 'setup') html = setup();
  else if (game.screen === 'history') html = historyScreen();
  else if (game.screen === 'replay') html = replayScreen();
  else if (game.phase === 'order') html = orderScreen();
  else if (game.phase === 'ban' || game.phase === 'prePick' || game.phase === 'postPick') html = bpScreen();
  else if (game.phase === 'summary') html = summaryScreen();
  else if (game.phase === 'lineup') html = lineupScreen();
  else if (game.phase === 'tactical_pick') html = tacticalPickScreen();
  else if (['match','match_draw','match_important','reveal','finished'].includes(game.phase)) html = match90Screen();
  else if (game.phase === 'penalty') html = penaltyScreen();
  else if (game.phase === 'result') html = resultScreen();
  else html = menu();
  app.innerHTML = html;
  bind();
  if (game.screen !== 'online-room' && game.screen !== 'replay') {
    try { scheduleAI(); } catch (err) { console.error('[render] scheduleAI failed:', err); }
  }
}
function bind() {
  document.querySelector('[data-new]')?.addEventListener('click',()=>{game={screen:'setup'};render();});
  document.querySelector('[data-online]')?.addEventListener('click',()=>{game={screen:'online-lobby'};render();});
  document.querySelector('[data-online-back]')?.addEventListener('click',reset);
  document.querySelector('[data-create-room]')?.addEventListener('click',()=>{const nickname=document.querySelector('#online-name').value.trim();if(!nickname)return;online.nickname=nickname;localStorage.setItem('football-bp-nickname',nickname);onlineConnect('CREATE',{nickname});});
  document.querySelector('[data-join-room]')?.addEventListener('click',()=>{const nickname=document.querySelector('#online-name').value.trim(),code=document.querySelector('#room-code').value.trim().toUpperCase();if(!nickname||code.length!==6)return;online.nickname=nickname;localStorage.setItem('football-bp-nickname',nickname);onlineConnect('JOIN',{nickname,code});});
  
  // 复制邀请链接按钮
  document.querySelector('[data-copy-invite]')?.addEventListener('click',()=>navigator.clipboard.writeText(online.invite||location.href));
  document.querySelector('[data-copy-link]')?.addEventListener('click',()=>{
    const linkInput = document.querySelector('#invite-link');
    if(linkInput) {
      linkInput.select();
      navigator.clipboard.writeText(linkInput.value);
      // 显示复制成功提示
      const btn = document.querySelector('[data-copy-link]');
      if(btn) {
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        btn.style.background = 'var(--green)';
        setTimeout(()=>{btn.textContent=originalText;btn.style.background='';},1500);
      }
    }
  });
  
  document.querySelectorAll('[data-online-card]').forEach(el=>el.onclick=()=>{selectedId=el.dataset.onlineCard;render();});
  document.querySelectorAll('[data-online-order]').forEach(el=>el.onclick=()=>onlineSend('ORDER',{choice:el.dataset.onlineOrder}));
  document.querySelector('[data-online-confirm]')?.addEventListener('click',()=>{
    if(!selectedId) return;
    const phase = online.state?.game?.phase;
    const action = phase === 'BAN' ? 'BAN' : (phase === 'PRE_PICK' ? 'PRE_PICK' : 'POST_PICK');
    onlineSend('ACTION',{action, playerId: selectedId});
    selectedId = null;
  });
  document.querySelectorAll('[data-online-event-card]').forEach(el => el.onclick = () => {
    onlineSend('EVENT_CARD', { cardId: el.dataset.onlineEventCard });
  });
  document.querySelector('[data-online-play-match]')?.addEventListener('click', () => onlineSend('PLAY_MATCH'));
  document.querySelector('[data-online-next-match]')?.addEventListener('click', () => onlineSend('NEXT_MATCH'));
  document.querySelector('[data-online-next]')?.addEventListener('click',()=>onlineSend('CONTINUE'));
  document.querySelector('[data-online-lineup-ready]')?.addEventListener('click',()=>onlineSend('LINEUP_READY'));
  document.querySelector('[data-online-rematch]')?.addEventListener('click',()=>onlineSend('REMATCH'));
  document.querySelectorAll('[data-online-leave]').forEach(el=>el.onclick=()=>{
    online.client?.socket?.close();
    online.state = null;
    online.code = null;
    online.client = null;
    localStorage.removeItem('bp-online-room');
    localStorage.removeItem('bp-online-token');
    history.replaceState(null,'',location.pathname);
    reset();
  });
  document.querySelector('[data-resume]')?.addEventListener('click',()=>{
    try {
      const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
      if (!saved || saved.version !== RULE_VERSION || !Array.isArray(saved.rounds) || !Number.isInteger(saved.round)) {
        localStorage.removeItem(ACTIVE_KEY);
        reset();
        return;
      }
      // 补齐可能缺失的字段，避免 currentActor 等崩溃
      saved.prePicks = saved.prePicks || [];
      saved.postPicks = saved.postPicks || [];
      saved.roundBans = saved.roundBans || [];
      saved.roundPickIds = saved.roundPickIds || { PLAYER: [], AI: [] };
      saved.match = saved.match || null;
      saved.bans = saved.bans || { PLAYER: [], AI: [] };
      saved.picks = saved.picks || { PLAYER: ['shared_courtois'], AI: ['shared_courtois'] };
      saved.log = saved.log || [];
      game = saved;
      render();
    } catch { reset(); }
  });
  document.querySelector('[data-history]')?.addEventListener('click',()=>{game={screen:'history'};render();});
  document.querySelector('[data-start]')?.addEventListener('click',()=>newGame({difficulty:document.querySelector('#difficulty').value,personality:document.querySelector('#personality').value,speed:document.querySelector('#speed').value,audio:document.querySelector('#audio').checked,timer:false}));
  document.querySelector('[data-cancel]')?.addEventListener('click',reset);
  document.querySelectorAll('[data-order]').forEach(el=>el.onclick=()=>beginRound(el.dataset.order));
  document.querySelectorAll('[data-card]').forEach(el=>el.onclick=()=>{selectedId=el.dataset.card;render();});
  document.querySelector('[data-confirm]')?.addEventListener('click',confirmPlayerAction);
  document.querySelector('[data-next]')?.addEventListener('click',continueRound);
  document.querySelectorAll('[data-slot]').forEach(el => el.onclick = () => {});
  // BP→比赛：选择战术风格
  document.querySelector('[data-start-match]')?.addEventListener('click', () => {
    // 进入战术选择
    game.match = game.match || { aStyle: null, bStyle: null };
    showTacticalPick();
  });
  document.querySelectorAll('[data-style]').forEach(el => el.onclick = () => pickTacticalStyle(el.dataset.style));
  // 比赛内交互
  document.querySelectorAll('.match-card[data-card]').forEach(el => el.onclick = () => playCard(el.dataset.card));
  document.querySelector('[data-fast-forward]')?.addEventListener('click', () => {
    if (!game.match) return;
    // 把 phase 切换到 match_important（虚拟），后续可继续推进
    advanceMatch();
  });
  document.querySelector('[data-match-continue]')?.addEventListener('click', () => {
    advanceMatch();
  });
  document.querySelectorAll('[data-switch-style]').forEach(el => el.onclick = () => {
    if (!game.match) return;
    setTacticalStyle(game, 'A', el.dataset.switchStyle);
    game.match.aStyle = el.dataset.switchStyle;
    snapshot(`切换战术：${STYLE_BY_ID[el.dataset.switchStyle]?.name}`);
    save(); render();
  });
  document.querySelector('[data-view-result]')?.addEventListener('click', () => {
    resolveMatch90(game);
    save(); render();
  });
  // 旧的 BO3 按钮保留（不匹配时自然忽略）
  document.querySelectorAll('[data-event-card]').forEach(el=>el.onclick=()=>{});
  document.querySelector('[data-event-play]')?.addEventListener('click',()=>{});
  document.querySelector('[data-match-next]')?.addEventListener('click',()=>{});
  document.querySelector('[data-rematch]')?.addEventListener('click',rematch);
  document.querySelector('[data-lineups]')?.addEventListener('click',()=>{game.phase='lineup';game.screen='lineup';render();});
  document.querySelector('[data-replay]')?.addEventListener('click',()=>{const h=histories()[0];game={screen:'replay',replayRecord:h,replayStep:0};render();});
  document.querySelectorAll('[data-history-replay]').forEach(el=>el.onclick=()=>{game={screen:'replay',replayRecord:histories()[Number(el.dataset.historyReplay)],replayStep:0};render();});
  document.querySelectorAll('[data-step]').forEach(el=>el.onclick=()=>{game.replayStep=Math.max(0,Math.min(game.replayRecord.snapshots.length-1,game.replayStep+Number(el.dataset.step)));render();});
  document.querySelectorAll('[data-home]').forEach(el=>el.onclick=()=>reset());
}
if(new URLSearchParams(location.search).get('room')) game={screen:'online-lobby'};
if (typeof window !== 'undefined') {
  window.__game = () => game;
  window.__triggerChemistryAnimation = (combo) => {
  const oldGame = game, oldPlayer = player;
  game = window._game;
  player = window.__test._player;
  try { return triggerChemistryAnimation(combo); } finally { game = oldGame; player = oldPlayer; }
};
  // 测试接口：允许从外部设置 game 数据并调用内部函数
  window.__test = {
    bindPlayers(players) {
      const _player = (id) => id === 'shared_courtois' ? { id: 'shared_courtois', name: '蒂博·库尔图瓦', position: 'GK', detailedPosition: 'GK', rating: 90, grade: 'S', club: '固定门将', league: '特殊卡', country: '比利时' } : players.find(p => p.id === id);
      window.__test._player = _player;
    },
    setGame(g) {
      window._game = g;
      window.__game = () => g;
    },
    assignToSlots(ids) {
      const oldGame = game, oldPlayer = player;
      game = window._game;
      player = window.__test._player;
      try { return assignToSlots(ids); } finally { game = oldGame; player = oldPlayer; }
    },
    bestAssignment(ids) {
      const oldGame = game, oldPlayer = player;
      game = window._game;
      player = window.__test._player;
      try { return bestAssignment(ids); } finally { game = oldGame; player = oldPlayer; }
    },
    lineupMetrics(a) {
      const oldGame = game, oldPlayer = player;
      game = window._game;
      player = window.__test._player;
      try { return lineupMetrics(a); } finally { game = oldGame; player = oldPlayer; }
    },
    roster(side) {
      const oldGame = game, oldPlayer = player;
      game = window._game;
      player = window.__test._player;
      try { return roster(side); } finally { game = oldGame; player = oldPlayer; }
    }
  };
  window.__findChemistryCombo = (id, list) => {
    const oldGame = game, oldPlayer = player;
    game = window._game;
    player = window.__test._player;
    try { return findChemistryCombo(id, list); } finally { game = oldGame; player = oldPlayer; }
  };
}
render();
