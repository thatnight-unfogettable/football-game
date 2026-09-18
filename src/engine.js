// 共享引擎：BP 规则、阵容评估、事件卡、BO3 模拟
// 纯函数设计，不依赖 DOM / WebSocket。前端人机、联机客户端与服务端均复用。
import { PLAYER_DATA } from '../data/players.js';
import { COUNTRY_ZH, CLUB_ZH, LEAGUE_ZH } from '../data/i18n.js';
import { NAME_ZH, NAME_ZH_EXTRA } from '../data/names-zh.js';

export const PROTOCOL = 3; // 协议版本号，与 src/app.js / server.js 保持一致

// ───────────────────────── 常量 ─────────────────────────
export const COURTOIS = {
  id: 'shared_courtois',
  name: '蒂博·库尔图瓦',
  englishName: 'Thibaut Courtois',
  rating: 90,
  position: 'GK',
  detailedPosition: 'GK',
  alternativePositions: [],
  country: '比利时',
  club: '固定门将',
  league: '特殊卡',
  grade: 'S',
};

export const SLOT_ORDER = ['LW', 'ST', 'RW', 'CM1', 'CDM', 'CM2', 'LB', 'CB1', 'CB2', 'RB', 'GK'];
export const SLOT_LABELS = {
  LW: '左边锋', ST: '中锋', RW: '右边锋',
  CM1: '中前卫', CDM: '后腰', CM2: '中前卫',
  LB: '左后卫', CB1: '中卫', CB2: '中卫', RB: '右后卫', GK: '门将',
};
export const POSITION_NAME = { FWD: '前锋', MID: '中场', DEF: '后卫', GK: '门将', MIXED: '全明星' };
export const BANS_PER_ROUND = 3;

// 4 轮规则（与 src/app.js ROUND_PLAN 对齐）
export const ROUND_PLAN = [
  { type: 'double', category: 'FWD', hint: '中锋/前锋' },
  { type: 'double', category: 'MID', hint: '中场' },
  { type: 'triple', category: 'DEF', hint: '后卫' },
  { type: 'triple', category: 'MIXED', hint: '各位置1人' },
];

// BO3 事件卡（与 src/app.js EVENT_CARDS 对齐）
export const EVENT_CARDS = [
  { id:'penalty',     name:'点球机会',     emoji:'🎯', type:'score', weight:1, desc:'禁区内手球！你获得点球并稳稳罚进', goals:1 },
  { id:'wondergoal',  name:'世界波',       emoji:'🌠', type:'score', weight:1, desc:'中场吊射世界波，本场+1球', goals:1 },
  { id:'counter',     name:'闪电反击',     emoji:'⚡', type:'score', weight:1, desc:'快速反击一击致命，本场+1球', goals:1 },
  { id:'stoppage',    name:'补时绝杀',     emoji:'⏱️', type:'score', weight:1, desc:'补时读秒绝杀，本场+1球', goals:1 },
  { id:'redcard',     name:'对手红牌',     emoji:'🟥', type:'score', weight:1, desc:'对方核心染红，他们本场-1球', oppGoals:-1 },
  { id:'owngoal',     name:'对手乌龙',     emoji:'🙈', type:'score', weight:1, desc:'对方后卫自摆乌龙，他们本场-1球', oppGoals:-1 },
  { id:'var',         name:'VAR改判',      emoji:'📺', type:'score', weight:1, desc:'VAR取消对方进球，他们本场-1球', oppGoals:-1 },
  { id:'butterfingers', name:'门将黄油手', emoji:'🧤', type:'score', weight:1, desc:'对方门将脱手送礼，他们本场-1球', oppGoals:-1 },
  { id:'onfire',      name:'状态火热',     emoji:'🔥', type:'stat', weight:1, desc:'全队状态爆棚，本场化学+15', selfChem:15 },
  { id:'lockerroom',  name:'更衣室风波',   emoji:'💥', type:'stat', weight:1, desc:'对方更衣室内讧，本场化学-15', oppChem:-15 },
  { id:'mastermind',  name:'战术大师',     emoji:'📋', type:'stat', weight:1, desc:'针对性战术奏效，本场纸面+5', selfPaper:5 },
  { id:'injury',      name:'核心伤退',     emoji:'🤕', type:'stat', weight:1, desc:'对方核心热身受伤，本场纸面-5', oppPaper:-5 },
  { id:'twelfthman',  name:'第十二人',     emoji:'📣', type:'stat', weight:1, desc:'主场球迷山呼海啸，本场化学+12', selfChem:12 },
  { id:'stamina',     name:'体能拉满',     emoji:'💪', type:'stat', weight:1, desc:'特训见效，本场纸面+3、化学+10', selfPaper:3, selfChem:10 },
  { id:'mindgames',   name:'心理博弈',     emoji:'🧠', type:'stat', weight:1, desc:'舆论战打崩对方心态，本场化学-12', oppChem:-12 },
  { id:'goldengen',   name:'黄金一代',     emoji:'👑', type:'stat', weight:1, desc:'年轻球员集体爆发，本场化学+18', selfChem:18 },
  { id:'ironwall',    name:'钢铁防线',     emoji:'🧱', type:'stat', weight:1, desc:'后防众志成城，本场纸面+5', selfPaper:5 },
  { id:'lucky',       name:'幸运星',       emoji:'🍀', type:'stat', weight:1, desc:'运气爆棚，纸面+3、对方化学-8', selfPaper:3, oppChem:-8 },
  { id:'rest',        name:'核心轮休',     emoji:'💤', type:'carry', weight:1, desc:'下一场对方核心轮休，纸面-5', nextOppPaper:-5 },
  { id:'revenge',     name:'复仇宣言',     emoji:'🔪', type:'carry', weight:1, desc:'下一场复仇buff，化学+15', nextSelfChem:15 },
  { id:'momentum',    name:'连胜气势',     emoji:'🚀', type:'carry', weight:1, desc:'下一场气势如虹，纸面+4', nextSelfPaper:4 },
  { id:'invasion',    name:'球迷冲场',     emoji:'🏃', type:'egg', weight:.25, desc:'球迷冲入场内！比赛腰斩，随机一方0-3判负', forfeit:true },
  { id:'oghattrick',  name:'乌龙帽子戏法', emoji:'🤡', type:'egg', weight:.25, desc:'对方后卫上演乌龙帽子戏法，他们-2球', oppGoals:-2 },
  { id:'gkgod',       name:'门将开挂',     emoji:'🧙', type:'egg', weight:.25, desc:'对方门将化身八臂哪吒，他们-2球', oppGoals:-2 },
  { id:'meteor',      name:'天降流星',     emoji:'☄️', type:'egg', weight:.25, desc:'流星砸进对方球门，你+2球', goals:2 },
  { id:'chaos',       name:'混沌之球',     emoji:'🎲', type:'egg', weight:.25, desc:'球场乱作一团，随机一方+2球', chaos:2 },
];

export const EVENT_BY_ID = Object.fromEntries(EVENT_CARDS.map(c => [c.id, c]));
export const EVENT_TYPE_NAME = { score:'比分事件', stat:'数值事件', carry:'跨场伏笔', egg:'彩蛋事件' };

// ───────────────────────── 数据规范化 ─────────────────────────
const PLAYER_NAME_MAP = { ...NAME_ZH, ...NAME_ZH_EXTRA };

function translateValue(map, value) {
  if (!value) return value;
  if (/[\u3400-\u9fff]/.test(value)) return value;
  return map[value] || map[value.trim()] || value;
}

function inferAlternatives(pos) {
  const map = {
    ST:['CF'], CF:['ST','CAM'], LW:['LM','RW'], RW:['RM','LW'], LM:['LW','CM'], RM:['RW','CM'],
    CAM:['CM','CF'], CM:['CAM','CDM'], CDM:['CM','CB'], LB:['LWB','CB'], RB:['RWB','CB'],
    LWB:['LB','LM'], RWB:['RB','RM'], CB:['LB','RB','CDM'], GK:[],
  };
  return map[pos] || [];
}

export function normalizePlayers() {
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

// ───────────────────────── RNG ─────────────────────────
export function hashSeed(value) {
  let h = 2166136261;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0 || 1;
}

export function createRng(seedValue) {
  let x = hashSeed(seedValue);
  const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x = x >>> 0; return x / 4294967296; };
  return {
    next,
    get state() { return x >>> 0; },
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// ───────────────────────── 候选池生成 ─────────────────────────
function tierChunk(pool, size, rng) {
  const top = pool.slice(0, size * 4);
  const tierSize = Math.ceil(top.length / 4);
  const tiers = Array.from({ length: 4 }, (_, i) => rng.shuffle(top.slice(i * tierSize, (i + 1) * tierSize)));
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
  while (cards.length < size && pool.length > cards.length) {
    const remain = pool.filter(p => !cards.some(c => c.id === p.id));
    if (!remain.length) break;
    cards.push(remain.shift());
  }
  return rng.shuffle(cards).map(p => p.id);
}

function generateRoundPool(players, category, size, usedIds, rng) {
  const pool = players.filter(p => p.position === category && !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
  return tierChunk(pool, size, rng);
}

function generateMixedPool(players, size, usedIds, rng) {
  const take = { FWD: 5, MID: 5, DEF: 4 };
  const parts = [];
  for (const [category, n] of Object.entries(take)) {
    const pool = players.filter(p => p.position === category && !usedIds.has(p.id)).sort((a, b) => b.rating - a.rating);
    parts.push(...rng.shuffle(pool.slice(0, n)).map(p => p.id));
  }
  return rng.shuffle(parts).slice(0, size);
}

export function generateRounds(players, rng) {
  const rounds = [];
  const used = new Set();
  for (let i = 0; i < ROUND_PLAN.length; i++) {
    const round = ROUND_PLAN[i];
    const size = round.type === 'double' ? 16 : 14;
    const pool = round.category === 'MIXED'
      ? generateMixedPool(players, size, used, rng)
      : generateRoundPool(players, round.category, size, used, rng);
    rounds.push({ type: round.type, category: round.category, hint: round.hint, candidates: pool });
    pool.forEach(id => used.add(id));
  }
  return rounds;
}

// ───────────────────────── BP 阶段状态机 ─────────────────────────
// 这是一组 pure 数据更新函数，操作 (state, action) => newState
// 用于前端人机 / 联机客户端 / 服务端三个地方

export function newGameState(settings = {}) {
  const seedText = `${Date.now()}-${Math.random()}-${settings.difficulty || 'normal'}-${settings.personality || 'power'}`;
  const rng = createRng(seedText);
  const players = normalizePlayers();
  const rounds = generateRounds(players, rng);
  return {
    version: PROTOCOL,
    seed: seedText,
    rngState: rng.state,
    settings,
    players,
    rounds,
    round: 0,
    candidates: [],
    roundType: rounds[0].type,
    roundHint: rounds[0].hint,
    phase: 'ORDER',          // ORDER | PRE_PICK | BAN | POST_PICK | PICK | ROUND_END | LINEUP | EVENT | MATCH | RESULT
    subPhase: null,          // prePick | ban | postPick | summary
    firstPicker: null,
    firstBan: null,
    banTurn: 0,
    banCount: 0,
    prePicks: [],
    postPicks: [],
    pickOwners: {},          // playerId -> 'A' | 'B'
    roundBans: [],           // [{ side, id }]
    bans: { A: [], B: [] },
    picks: { A: ['shared_courtois'], B: ['shared_courtois'] },
    roundPickIds: { A: [], B: [] },
    logs: [],
    lineup: { A: null, B: null },
    series: null,
    result: null,
  };
}

function findPlayer(state, id) {
  if (id === COURTOIS.id) return COURTOIS;
  return state.players.find(p => p.id === id);
}

// 当前应该出手的一方：'A' 或 'B'，无则 null
export function activeSide(state) {
  if (state.phase === 'PRE_PICK') {
    const taken = state.prePicks.length;
    if (taken === 0) return state.firstPicker;
    return state.firstPicker === 'A' ? 'B' : 'A';
  }
  if (state.phase === 'POST_PICK' || state.phase === 'PICK') {
    const taken = state.postPicks.length;
    if (taken === 0) return state.firstPicker;
    return state.firstPicker === 'A' ? 'B' : 'A';
  }
  if (state.phase === 'BAN') {
    return state.banTurn % 2 === 0 ? state.firstBan : (state.firstBan === 'A' ? 'B' : 'A');
  }
  return null;
}

export function availableIds(state) {
  const removed = new Set([
    ...state.roundBans.map(x => x.id),
    ...state.prePicks,
    ...state.postPicks,
  ]);
  return state.candidates.filter(id => !removed.has(id));
}

// ──────── 提交操作 ────────
export function applyOrder(state, side, choice /* 'first' | 'last' */) {
  if (state.phase !== 'ORDER') return { ok: false, error: '当前不能选择顺位' };
  state.firstPicker = choice === 'first' ? side : (side === 'A' ? 'B' : 'A');
  state.candidates = [...state.rounds[state.round].candidates];
  state.roundType = state.rounds[state.round].type;
  state.roundHint = state.rounds[state.round].hint;
  state.prePicks = [];
  state.postPicks = [];
  state.roundBans = [];
  state.banTurn = 0;
  state.banCount = 0;
  // 双选轮：先各选 1 人 → ban → 再各选 1 人
  // 三选轮：先各选 1 人 → ban → 再各选 2 人
  if (state.roundType === 'double') {
    state.phase = 'PRE_PICK';
    state.firstBan = state.firstPicker;
  } else {
    state.phase = 'BAN';
    state.firstBan = state.firstPicker === 'A' ? 'B' : 'A';
  }
  state.logs.push({ type: 'ORDER', side, choice, round: state.round, at: Date.now() });
  return { ok: true };
}

export function applyPrePick(state, side, id) {
  if (state.phase !== 'PRE_PICK') return { ok: false, error: '当前不在选人阶段' };
  if (activeSide(state) !== side) return { ok: false, error: '还没轮到你' };
  if (!availableIds(state).includes(id)) return { ok: false, error: '该球员不可选' };
  state.prePicks.push(id);
  state.picks[side].push(id);
  state.pickOwners[id] = side;
  state.roundPickIds[side].push(id);
  state.logs.push({ type: 'PRE_PICK', side, id, round: state.round, at: Date.now() });
  if (state.prePicks.length >= 2) {
    state.phase = 'BAN';
    state.firstBan = state.firstPicker;
  }
  return { ok: true };
}

export function applyBan(state, side, id) {
  if (state.phase !== 'BAN') return { ok: false, error: '当前不在禁选阶段' };
  if (activeSide(state) !== side) return { ok: false, error: '还没轮到你' };
  if (!availableIds(state).includes(id)) return { ok: false, error: '该球员不可禁' };
  state.roundBans.push({ side, id });
  state.bans[side].push(id);
  state.banTurn++;
  state.banCount = state.banTurn;
  state.logs.push({ type: 'BAN', side, id, round: state.round, at: Date.now() });
  if (state.banTurn >= BANS_PER_ROUND) {
    state.phase = state.roundType === 'double' ? 'POST_PICK' : 'PICK';
    state.postPicks = [];
  }
  return { ok: true };
}

export function applyPostPick(state, side, id) {
  if (state.phase !== 'POST_PICK' && state.phase !== 'PICK') return { ok: false, error: '当前不在选人阶段' };
  if (activeSide(state) !== side) return { ok: false, error: '还没轮到你' };
  if (!availableIds(state).includes(id)) return { ok: false, error: '该球员不可选' };
  const target = state.phase === 'POST_PICK' ? state.postPicks : state.postPicks;
  target.push(id);
  state.picks[side].push(id);
  state.pickOwners[id] = side;
  state.roundPickIds[side].push(id);
  state.logs.push({ type: 'POST_PICK', side, id, round: state.round, at: Date.now() });
  const need = state.roundType === 'triple' ? 4 : 2;
  if (target.length >= need) {
    state.phase = 'ROUND_END';
  }
  return { ok: true };
}

// 双方都按了"继续"，进入下一轮 / 阵容阶段
export function advanceRound(state) {
  if (state.phase !== 'ROUND_END') return { ok: false, error: '本轮还未完成' };
  state.round++;
  if (state.round >= state.rounds.length) {
    state.phase = 'LINEUP';
    state.lineup.A = assignToSlots(state.picks.A, state.players);
    state.lineup.B = assignToSlots(state.picks.B, state.players);
  } else {
    state.phase = 'ORDER';
    state.candidates = [];
    state.roundType = state.rounds[state.round].type;
    state.roundHint = state.rounds[state.round].hint;
    state.firstPicker = null;
    state.firstBan = null;
    state.prePicks = [];
    state.postPicks = [];
    state.roundBans = [];
    state.banTurn = 0;
    state.banCount = 0;
    state.pickOwners = {};
    state.roundPickIds = { A: [], B: [] };
  }
  return { ok: true };
}

// ───────────────────────── 阵容排布 / 化学评估 ─────────────────────────
export function roleFit(player, slot) {
  if (!player) return 0;
  if (slot === 'GK') return player.position === 'GK' ? 1 : 0;
  const target = slot.replace(/[12]/g, '');
  const pos = player.detailedPosition || player.position;
  const alt = player.alternativePositions || [];
  if (pos === target) return 1;
  if (alt.includes(target)) return 0.96;
  const near = {
    LW: ['RW','LM','ST','CF'], RW: ['LW','RM','ST','CF'], ST: ['CF','LW','RW'],
    CM: ['CAM','CDM','LM','RM'], CDM: ['CM','CB'], LB: ['LWB','CB'], RB: ['RWB','CB'],
    CB: ['LB','RB','CDM'],
  }[target] || [];
  return near.includes(pos) ? 0.96 : 0.92;
}

export function assignToSlots(ids, players) {
  const cards = ids.map(id => (id === COURTOIS.id ? COURTOIS : players.find(p => p.id === id))).filter(Boolean);
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

export function lineupMetrics(assignment, players) {
  const playerAt = (slot) => assignment[slot] === COURTOIS.id
    ? COURTOIS
    : players.find(p => p.id === assignment[slot]);
  const entries = SLOT_ORDER.map(slot => {
    const p = playerAt(slot);
    return { slot, p, fit: p ? roleFit(p, slot) : 0 };
  }).filter(x => x.p);

  const lineAverage = (line) => {
    const rows = entries.filter(x => x.p.position === line);
    if (rows.length === 0) return 0;
    return rows.reduce((s, x) => s + x.p.rating * x.fit, 0) / rows.length;
  };
  const paper = lineAverage('GK') * 0.1 + lineAverage('DEF') * 0.3 + lineAverage('MID') * 0.3 + lineAverage('FWD') * 0.3;
  const nonGk = entries.filter(x => x.slot !== 'GK');
  const slotFit = nonGk.reduce((s, x) => s + x.fit, 0) / 10 * 32;
  const roles = { FWD: ['LW','ST','RW'], MID: ['CM1','CDM','CM2'], DEF: ['LB','CB1','CB2','RB'] };
  let template = 0;
  Object.values(roles).forEach(slots => {
    const complete = slots.every(slot => {
      const id = assignment[slot];
      const p = id ? playerAt(slot) : null;
      return p && roleFit(p, slot) >= 0.96;
    });
    if (complete) template += 8 / 3;
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
  const overall = (paper + chemistry) / 2;
  return {
    paper,
    chemistry,
    overall,
    lines: { FWD: lineAverage('FWD'), MID: lineAverage('MID'), DEF: lineAverage('DEF'), GK: 90 },
    parts: { slotFit, template, club, league, nation, grade: leaders + balance },
  };
}

// ───────────────────────── 事件卡 / BO3 ─────────────────────────
export function drawEventCards(rng, count, excludeIds = [], noCarry = false) {
  const pool = EVENT_CARDS.filter(c => !excludeIds.includes(c.id) && !(noCarry && c.type === 'carry'));
  const drawn = [];
  while (drawn.length < count && pool.length) {
    const totalW = pool.reduce((s, c) => s + (c.weight || 1), 0);
    let r = rng.next() * totalW, idx = 0;
    for (let i = 0; i < pool.length; i++) { r -= pool[i].weight || 1; if (r <= 0) { idx = i; break; } }
    drawn.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return drawn;
}

export function eventCardValue(rng, card) {
  let v = 0;
  if (card.forfeit) v += 5;
  if (card.chaos) v += 6;
  if (card.goals) v += card.goals * 10;
  if (card.oppGoals) v += Math.abs(card.oppGoals) * 10;
  if (card.selfPaper) v += card.selfPaper * 2;
  if (card.selfChem) v += card.selfChem * 0.5;
  if (card.oppPaper) v += Math.abs(card.oppPaper) * 2;
  if (card.oppChem) v += Math.abs(card.oppChem) * 0.5;
  if (card.nextSelfPaper) v += card.nextSelfPaper * 1.5;
  if (card.nextSelfChem) v += card.nextSelfChem * 0.35;
  if (card.nextOppPaper) v += Math.abs(card.nextOppPaper) * 1.5;
  if (card.nextOppChem) v += Math.abs(card.nextOppChem) * 0.35;
  return v + rng.next() * 1.5;
}

export function pickAiEventCard(rng, ids) {
  if (!ids.length) return null;
  return ids.map(id => ({ id, v: eventCardValue(rng, EVENT_BY_ID[id]) })).sort((a, b) => b.v - a.v)[0].id;
}

export function startSeries(state, rng) {
  state.series = {
    matchIndex: 0,
    stage: 'draw',
    matches: [],
    aWins: 0,
    bWins: 0,
    aDraw: [],
    bDraw: [],
    aChoice: null,
    bChoice: null,
    pending: null,
  };
  startMatchDraw(state, rng);
}

export function startMatchDraw(state, rng) {
  const s = state.series;
  const noCarry = s.matchIndex >= 2;
  const usedIds = s.matches.flatMap(m => [m.events?.A, m.events?.B]).filter(Boolean);
  s.aDraw = drawEventCards(rng, 3, usedIds, noCarry).map(c => c.id);
  s.bDraw = drawEventCards(rng, 3, [...usedIds, ...s.aDraw], noCarry).map(c => c.id);
  s.aChoice = null;
  s.bChoice = null;
  s.stage = 'draw';
  state.phase = 'EVENT';
}

export function confirmEvent(state, side, cardId) {
  const s = state.series;
  if (s.stage !== 'draw') return { ok: false, error: '当前不在选卡阶段' };
  if (side === 'A') {
    if (!s.aDraw.includes(cardId)) return { ok: false, error: '无效手牌' };
    s.aChoice = cardId;
  } else {
    if (!s.bDraw.includes(cardId)) return { ok: false, error: '无效手牌' };
    s.bChoice = cardId;
  }
  return { ok: true };
}

function collectMods(ac, bc, pending) {
  const m = { aPaper: pending?.aPaper || 0, bPaper: pending?.bPaper || 0, aChem: pending?.aChem || 0, bChem: pending?.bChem || 0, ag: 0, bg: 0, chaos: 0, forfeit: null };
  const add = (card, holder) => {
    if (!card) return;
    const mine = holder === 'A';
    const sp = mine ? 'aPaper' : 'bPaper', sc = mine ? 'aChem' : 'bChem';
    const op = mine ? 'bPaper' : 'aPaper', oc = mine ? 'bChem' : 'aChem';
    const mg = mine ? 'ag' : 'bg', og = mine ? 'bg' : 'ag';
    if (card.goals) m[mg] += card.goals;
    if (card.oppGoals) m[og] += card.oppGoals;
    if (card.selfPaper) m[sp] += card.selfPaper;
    if (card.selfChem) m[sc] += card.selfChem;
    if (card.oppPaper) m[op] += card.oppPaper;
    if (card.oppChem) m[oc] += card.oppChem;
    if (card.chaos) m.chaos += card.chaos;
    if (card.forfeit) m.forfeit = holder;
  };
  add(ac, 'A'); add(bc, 'B');
  return m;
}

function collectCarry(ac, bc) {
  const p = { aPaper: 0, bPaper: 0, aChem: 0, bChem: 0 };
  const add = (card, holder) => {
    if (!card) return;
    const mine = holder === 'A';
    const sp = mine ? 'aPaper' : 'bPaper', sc = mine ? 'aChem' : 'bChem';
    const op = mine ? 'bPaper' : 'aPaper', oc = mine ? 'bChem' : 'aChem';
    if (card.nextSelfPaper) p[sp] += card.nextSelfPaper;
    if (card.nextSelfChem) p[sc] += card.nextSelfChem;
    if (card.nextOppPaper) p[op] += card.nextOppPaper;
    if (card.nextOppChem) p[oc] += card.nextOppChem;
  };
  add(ac, 'A'); add(bc, 'B');
  return p;
}

function normalRandom(rng) {
  const u = 1 - rng.next(), v = 1 - rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function poisson(rng, lambda) {
  const l = Math.exp(-lambda);
  let p = 1, k = 0;
  do { k++; p *= rng.next(); } while (p > l && k < 10);
  return k - 1;
}

export function resolveMatch(state, rng) {
  const s = state.series;
  if (s.stage !== 'reveal') return { ok: false, error: '双方尚未选卡' };
  const ac = EVENT_BY_ID[s.aChoice], bc = EVENT_BY_ID[s.bChoice];
  const am = lineupMetrics(state.lineup.A, state.players);
  const bm = lineupMetrics(state.lineup.B, state.players);
  const mods = collectMods(ac, bc, s.pending || {});
  const home = s.matchIndex === 0 ? 1 : s.matchIndex === 1 ? -1 : 0;
  let match;
  if (mods.forfeit) {
    const loser = rng.next() < 0.5 ? 'A' : 'B';
    match = { ag: loser === 'A' ? 0 : 3, bg: loser === 'B' ? 0 : 3, forfeit: true };
  } else {
    const aO = am.overall + (mods.aPaper + mods.aChem) / 2;
    const bO = bm.overall + (mods.bPaper + mods.bChem) / 2;
    const aVar = normalRandom(rng) * 2 * (1 - am.chemistry / 180);
    const bVar = normalRandom(rng) * 2 * (1 - bm.chemistry / 180);
    const as = aO + aVar + Math.max(0, home);
    const bs = bO + bVar + Math.max(0, -home);
    let ag = poisson(rng, Math.max(0.25, 1.35 * Math.exp((as - bs) / 16))) + mods.ag;
    let bg = poisson(rng, Math.max(0.25, 1.35 * Math.exp((bs - as) / 16))) + mods.bg;
    if (mods.chaos) { if (rng.next() < 0.5) ag += mods.chaos; else bg += mods.chaos; }
    ag = Math.max(0, ag); bg = Math.max(0, bg);
    match = { ag, bg };
  }
  let winner = 'DRAW';
  if (match.ag > match.bg) { winner = 'A'; s.aWins++; }
  else if (match.bg > match.ag) { winner = 'B'; s.bWins++; }
  match = { ...match, venue: home === 1 ? 'A 主场' : home === -1 ? 'B 主场' : '中立场', winner, events: { A: s.aChoice, B: s.bChoice } };
  s.matches.push(match);
  s.pending = collectCarry(ac, bc);
  s.stage = 'match';
  state.phase = 'MATCH';
  return { ok: true, match };
}

export function finishSeries(state) {
  const s = state.series;
  const am = lineupMetrics(state.lineup.A, state.players);
  const bm = lineupMetrics(state.lineup.B, state.players);
  let winner = s.aWins > s.bWins ? 'A' : 'B';
  if (Math.abs(am.overall - bm.overall) <= 0.5 && s.aWins === s.bWins) {
    winner = am.chemistry >= bm.chemistry ? 'A' : 'B';
  }
  const winSide = winner === 'A' ? state.lineup.A : state.lineup.B;
  const winMetrics = winner === 'A' ? am : bm;
  const mvp = SLOT_ORDER
    .map(slot => (winSide[slot] ? (winSide[slot] === COURTOIS.id ? COURTOIS : state.players.find(p => p.id === winSide[slot])) : null))
    .filter(p => p && p.position !== 'GK')
    .map(p => ({ p, score: p.rating + 2 + winMetrics.chemistry * 0.05 + Math.random() * 3 }))
    .sort((a, b) => b.score - a.score)[0]?.p;
  state.result = {
    winner,
    aWins: s.aWins,
    bWins: s.bWins,
    matches: s.matches,
    metrics: { A: am, B: bm },
    mvpId: mvp?.id,
  };
  state.phase = 'RESULT';
  return { ok: true };
}

// ───────────────────────── AI ─────────────────────────
function candidateThreat(player, own, enemy, personality, action) {
  const ownLinks = own.reduce((n, x) => n + (x.club === player.club ? 5 : 0) + (x.league === player.league ? 2 : 0) + (x.country === player.country ? 3 : 0), 0);
  const enemyLinks = enemy.reduce((n, x) => n + (x.club === player.club ? 4 : 0) + (x.league === player.league ? 1 : 0) + (x.country === player.country ? 2 : 0), 0);
  if (action === 'ban') return player.rating + (personality === 'counter' ? enemyLinks * 1.2 : enemyLinks * 0.4);
  return player.rating + (personality === 'chemistry' ? ownLinks * 1.3 : ownLinks * 0.35) + (personality === 'counter' ? enemyLinks * 0.25 : 0);
}

export function aiChoose(rng, state, side, action /* 'pick' | 'ban' */) {
  const ids = availableIds(state);
  const difficulty = state.settings?.difficulty || 'normal';
  const mistakeRate = { easy: 0.30, normal: 0.15, hard: 0.05 }[difficulty];
  if (!ids.length) return null;
  if (rng.next() < mistakeRate) return ids[Math.floor(rng.next() * ids.length)];
  const ownCards = state.picks[side].map(id => id === COURTOIS.id ? COURTOIS : state.players.find(p => p.id === id)).filter(Boolean);
  const enemyCards = state.picks[side === 'A' ? 'B' : 'A'].map(id => id === COURTOIS.id ? COURTOIS : state.players.find(p => p.id === id)).filter(Boolean);
  const personality = state.settings?.personality || 'power';
  const scored = ids.map(id => {
    const player = id === COURTOIS.id ? COURTOIS : state.players.find(p => p.id === id);
    const score = candidateThreat(player, ownCards, enemyCards, personality, action);
    return { id, score };
  }).sort((a, b) => b.score - a.score);
  if (difficulty === 'hard') {
    return scored.slice(0, Math.min(5, scored.length))
      .map((x, i) => ({ ...x, score: x.score + (5 - i) * 0.15 }))
      .sort((a, b) => b.score - a.score)[0].id;
  }
  return scored[0].id;
}

// ───────────────────────── 公开给前端的 sanitize ─────────────────────────
// 对外广播时裁剪掉一些内部字段，并保留前端 `src/app.js` 的命名
export function sanitizeForClient(state) {
  return {
    version: state.version,
    seed: state.phase === 'RESULT' ? state.seed : null,
    settings: state.settings,
    phase: state.phase,
    subPhase: state.subPhase,
    round: state.round,
    candidates: state.candidates,
    roundType: state.roundType,
    roundHint: state.roundHint,
    firstPicker: state.firstPicker,
    firstBan: state.firstBan,
    banTurn: state.banTurn,
    banCount: state.banCount,
    prePicks: state.prePicks,
    postPicks: state.postPicks,
    pickOwners: state.pickOwners,
    roundBans: state.roundBans,
    bans: state.bans,
    picks: state.picks,
    lineup: state.lineup,
    series: state.series,
    result: state.result,
    activeSide: activeSide(state),
    logs: state.logs,
  };
}
