// 共享引擎：BP 规则、阵容评估、90分钟事件驱动比赛
// 纯函数设计，不依赖 DOM / WebSocket。前端人机、联机客户端与服务端均复用。
import { PLAYER_DATA } from '../data/players.js';
import { COUNTRY_ZH, CLUB_ZH, LEAGUE_ZH } from '../data/i18n.js';
import { NAME_ZH, NAME_ZH_EXTRA } from '../data/names-zh.js';

export const PROTOCOL = 4; // 协议版本号 v4 = 90分钟单场模式

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

// ═══════════════════════════════════════════════════════
// 90分钟事件卡池（v4 协议）
// type='instant'  : 即时牌，tickMinute 到达 minute 时一次性触发
// type='modifier' : 修正牌，在 minute 窗口内持续提升/降低 Bernoulli 概率
// ═══════════════════════════════════════════════════════

// 即时牌（A 类，约 18 张）
const INSTANT_CARDS = [
  { id:'penalty',     name:'点球机会',     emoji:'🎯', type:'instant', weight:1,
    minute:35, minuteEnd:75,
    instant:{ goals:1 }, narrate:'🎯 十二码点球命中！' },
  { id:'wondergoal',  name:'世界波',       emoji:'🌠', type:'instant', weight:1,
    minute:50, minuteEnd:85,
    instant:{ goals:1 }, narrate:'🌠 世界波！惊天吊射破网！' },
  { id:'counter',     name:'闪电反击',     emoji:'⚡', type:'instant', weight:1,
    minute:40, minuteEnd:80,
    instant:{ goals:1 }, narrate:'⚡ 闪电反击！皮球滚入网窝！' },
  { id:'header',      name:'头槌破门',     emoji:'🧑', type:'instant', weight:1,
    minute:30, minuteEnd:80,
    instant:{ goals:1 }, narrate:'🧑 角球中卫头槌破门！' },
  { id:'freekick',    name:'任意球破门',   emoji:'🌀', type:'instant', weight:1,
    minute:25, minuteEnd:85,
    instant:{ goals:1 }, narrate:'🌀 圆月弯刀！任意球直窜死角！' },
  { id:'brace',       name:'梅开二度',     emoji:'⚡⚡', type:'instant', weight:.6,
    minute:55, minuteEnd:88,
    instant:{ goals:2 }, narrate:'⚡⚡ 前锋梅开二度！' },
  { id:'owngoal',     name:'对手乌龙球',   emoji:'🙈', type:'instant', weight:1,
    minute:30, minuteEnd:80,
    instant:{ oppGoals:1 }, narrate:'🙈 乌龙球！对方后卫自摆乌龙！' },
  { id:'redcard',     name:'对手红牌',     emoji:'🟥', type:'instant', weight:1,
    minute:35, minuteEnd:70,
    instant:{ oppGoals:-1 }, narrate:'🟥 红牌！对方少一人！' },
  { id:'var',         name:'VAR改判',      emoji:'📺', type:'instant', weight:1,
    minute:40, minuteEnd:88,
    instant:{ oppGoals:-1 }, narrate:'📺 VAR改判！进球无效！' },
  { id:'butterfingers', name:'门将脱手',   emoji:'🧤', type:'instant', weight:1,
    minute:30, minuteEnd:80,
    instant:{ oppGoals:-1 }, narrate:'🧤 黄油手！门将脱手送礼！' },
  { id:'stoppage_eq', name:'补时绝平',    emoji:'⏱️', type:'instant', weight:1,
    minute:85, minuteEnd:94,
    instant:{ goals:1 }, narrate:'⏱️ 读秒绝平！补时94分钟进球！' },
  { id:'late_winner', name:'全场绝杀',    emoji:'💥', type:'instant', weight:.8,
    minute:82, minuteEnd:90,
    instant:{ goals:1 }, narrate:'💥 绝杀！全场沸腾！' },
  { id:'hattrick',   name:'帽子戏法',     emoji:'🎩', type:'instant', weight:.4,
    minute:60, minuteEnd:90,
    instant:{ goals:3 }, narrate:'🎩 帽子戏法！超级前锋独中三元！' },
  { id:'goalkeeper_g', name:'门将进球',   emoji:'🧙', type:'instant', weight:.3,
    minute:88, minuteEnd:94,
    instant:{ goals:1 }, narrate:'🧙 神迹！门将进球！' },
  { id:'penalty_miss', name:'对手点球失', emoji:'🙅', type:'instant', weight:.8,
    minute:40, minuteEnd:80,
    instant:{ goals:1 }, narrate:'🙅 对手点球打飞！快攻得手！' },
  { id:'redcard_self', name:'己方红牌',   emoji:'🟥', type:'instant', weight:.5,
    minute:40, minuteEnd:75,
    instant:{ oppGoals:1 }, narrate:'🟥 己方染红！少一人应战！' },
  { id:'og_self',      name:'己方乌龙',    emoji:'🙈', type:'instant', weight:.5,
    minute:35, minuteEnd:75,
    instant:{ oppGoals:1 }, narrate:'🙈 己方乌龙！运气不在我们这边。' },
  { id:'kickoff_goal', name:'开场闪击',   emoji:'🚀', type:'instant', weight:.8,
    minute:1, minuteEnd:5,
    instant:{ goals:1 }, narrate:'🚀 闪击！开场不到1分钟破门！' },
];

// 修正牌（B 类，约 13 张）
const MODIFIER_CARDS = [
  { id:'onfire',       name:'状态火热',    emoji:'🔥', type:'modifier', weight:1,
    windowStart:15, windowEnd:45, netPower:6,
    narrate:'🔥 状态火热！进攻势如破竹！' },
  { id:'tiki_taka',    name:'传导压制',    emoji:'🔄', type:'modifier', weight:1,
    windowStart:20, windowEnd:50, netPower:5,
    narrate:'🔄 传导压制！对手阵型被压扁！' },
  { id:'pressing',     name:'高位压迫',    emoji:'⚔️', type:'modifier', weight:1,
    windowStart:25, windowEnd:55, netPower:5,
    narrate:'⚔️ 高位压迫！对手频繁失误！' },
  { id:'wing_play',    name:'两翼齐飞',    emoji:'🌀', type:'modifier', weight:1,
    windowStart:30, windowEnd:60, netPower:6,
    narrate:'🌀 两翼齐飞！边路传中制造威胁！' },
  { id:'stamina_boost',name:'体能优势',   emoji:'💪', type:'modifier', weight:1,
    windowStart:60, windowEnd:90, netPower:8,
    narrate:'💪 体能优势！对手跑动明显下降！' },
  { id:'deadball',     name:'定位球专家',  emoji:'🎯', type:'modifier', weight:1,
    windowStart:30, windowEnd:75, netPower:5,
    narrate:'🎯 定位球专家！角球连续制造险情！' },
  { id:'injury_wave',  name:'伤病潮',     emoji:'🤕', type:'modifier', weight:1,
    windowStart:40, windowEnd:70, netPower:-5,
    narrate:'🤕 对方球员受伤！场上压力骤减！' },
  { id:'lockerroom',   name:'更衣室风波', emoji:'💥', type:'modifier', weight:1,
    windowStart:45, windowEnd:75, netPower:-5,
    narrate:'💥 对手更衣室起争执！防守涣散！' },
  { id:'fatigue',      name:'对手体能透支', emoji:'🏃', type:'modifier', weight:1,
    windowStart:55, windowEnd:85, netPower:-6,
    narrate:'🏃 对方体能透支！防守动作变形！' },
  { id:'goldengen',    name:'黄金一代',   emoji:'👑', type:'modifier', weight:.7,
    windowStart:30, windowEnd:75, netPower:10,
    narrate:'👑 黄金一代！多点开花势不可挡！' },
  { id:'ironwall',     name:'钢铁防线',   emoji:'🧱', type:'modifier', weight:.7,
    windowStart:20, windowEnd:80, netPower:8,
    narrate:'🧱 钢铁防线！对手进攻毫无办法！' },
  { id:'twelfthman',   name:'第十二人',   emoji:'📣', type:'modifier', weight:1,
    windowStart:25, windowEnd:55, netPower:6,
    narrate:'📣 主场球迷！进攻如有神助！' },
  { id:'mindgames',    name:'心理战',     emoji:'🧠', type:'modifier', weight:1,
    windowStart:35, windowEnd:65, netPower:4,
    narrate:'🧠 心理战！对手判断连连失误！' },
];

export const MATCH_CARDS = [...INSTANT_CARDS, ...MODIFIER_CARDS];
export const EVENT_BY_ID = Object.fromEntries(MATCH_CARDS.map(c => [c.id, c]));
export const EVENT_TYPE_NAME = { instant:'即时事件', modifier:'持续修正', style:'战术风格' };

// ═══════════════════════════════════════════════════════
// 战术风格（C 类，不入牌池，随时可选，任意切换）
// ═══════════════════════════════════════════════════════
export const TACTICAL_STYLES = [
  {
    id:'longball', emoji:'🏃', name:'长传冲吊',
    desc:'高举高打，45度斜长传找高中锋',
    phaseBonus:[
      { start:0,  end:30, selfPaper:3,  selfChem:5  },
      { start:31, end:60, selfPaper:4,  selfChem:4  },
      { start:61, end:90, selfPaper:5,  selfChem:6  },
    ],
  },
  {
    id:'tikitaka', emoji:'🔄', name:'传控打法',
    desc:'短传渗透，中场控球，耐心寻找空当',
    phaseBonus:[
      { start:0,  end:30, selfPaper:2,  selfChem:8  },
      { start:31, end:60, selfPaper:4,  selfChem:10 },
      { start:61, end:90, selfPaper:3,  selfChem:7  },
    ],
  },
  {
    id:'pressing', emoji:'⚔️', name:'高位压迫',
    desc:'前场反抢，快速夺回球权打反击',
    phaseBonus:[
      { start:0,  end:30, selfPaper:5,  selfChem:6  },
      { start:31, end:60, selfPaper:3,  selfChem:4  },
      { start:61, end:90, selfPaper:1,  selfChem:2  },
    ],
  },
  {
    id:'wing', emoji:'🌀', name:'边路传中',
    desc:'两翼拉开下底，45度炸',
    phaseBonus:[
      { start:0,  end:30, selfPaper:2,  selfChem:4  },
      { start:31, end:60, selfPaper:5,  selfChem:7  },
      { start:61, end:90, selfPaper:4,  selfChem:6  },
    ],
  },
  {
    id:'counter_style', emoji:'⚡', name:'防守反击',
    desc:'541低位防守，断球后快速反击',
    phaseBonus:[
      { start:0,  end:30, selfPaper:1,  selfChem:2  },
      { start:31, end:60, selfPaper:3,  selfChem:5  },
      { start:61, end:90, selfPaper:6,  selfChem:8  },
    ],
  },
  {
    id:'parking', emoji:'🅿️', name:'大巴死守',
    desc:'密集防守，541铁桶阵，力保大门不失',
    phaseBonus:[
      { start:0,  end:30, selfPaper:1,  selfChem:3  },
      { start:31, end:60, selfPaper:2,  selfChem:4  },
      { start:61, end:90, selfPaper:4,  selfChem:6  },
    ],
  },
];
export const STYLE_BY_ID = Object.fromEntries(TACTICAL_STYLES.map(s => [s.id, s]));

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
    phase: 'ORDER',          // BP: ORDER | PRE_PICK | BAN | POST_PICK | PICK | ROUND_END | LINEUP
                               // 比赛: TACTICAL_PICK → match_draw | match_important | match_reveal | match_finished | penalty | RESULT
    subPhase: null,
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
    match: null,             // 90分钟比赛状态，BP完成后初始化
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
  if (state.phase === 'tactical_pick') {
    // 双方都还没选：先 A 后 B 提示；任一方未选则轮到对方
    if (!state.match?.aStyle) return 'A';
    if (!state.match?.bStyle) return 'B';
    return null;
  }
  if (state.phase === 'match' && state.match?.phase === 'match_important') {
    return null; // 等待双方都按继续
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

// ═══════════════════════════════════════════════════════
// 90分钟事件驱动比赛引擎（v4）
// 机制：
//   - 开局双方各抽 3 张手牌（A/B类）
//   - 战术风格开局选，随时可切
//   - 比赛 tickMinute: 1→90，每分钟跑一次 Bernoulli
//   - 「重要」模式：详细播报 + 可出牌；「快进」模式：1秒=1分钟
//   - 即时牌：tickMinute 到达 minute 时触发
//   - 修正牌：tickMinute 进入 windowStart~windowEnd 时激活
//   - 同时出牌 → 同时亮 → 系统推进到触发分钟
//   - 90分钟打平 → 点球大战（5轮）
// ═══════════════════════════════════════════════════════

// 抽牌（从 ~45 张牌池抽 N 张，排除已用）
export function drawMatchCards(rng, count, excludeIds = []) {
  const pool = MATCH_CARDS.filter(c => !excludeIds.includes(c.id));
  const drawn = [];
  while (drawn.length < count && pool.length) {
    const totalW = pool.reduce((s, c) => s + (c.weight || 1), 0);
    let r = rng.next() * totalW;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight || 1;
      if (r <= 0) { drawn.push(pool[i]); pool.splice(i, 1); break; }
    }
  }
  return drawn;
}

// AI 选牌策略
export function aiPickMatchCard(rng, ids) {
  if (!ids.length) return null;
  const scored = ids.map(id => {
    const c = EVENT_BY_ID[id];
    if (!c) return { id, score: 0 };
    let score = 0;
    if (c.instant?.goals) score += (c.instant.goals > 1 ? c.instant.goals * 12 : 10);
    if (c.instant?.oppGoals) score += Math.abs(c.instant.oppGoals) * 10;
    if (c.netPower > 0) score += c.netPower * 1.5;
    if (c.netPower < 0) score += Math.abs(c.netPower) * 1.2;
    // 随机扰动
    score += rng.next() * 3;
    return { id, score };
  });
  return scored.sort((a, b) => b.score - a.score)[0]?.id || ids[0];
}

// ─── 比赛状态初始化 ───
export function startMatch90(state, rng) {
  // 牌池约 45 张，各抽 3 张
  const usedIds = [];
  const aDraw = drawMatchCards(rng, 3, usedIds);
  usedIds.push(...aDraw.map(c => c.id));
  const bDraw = drawMatchCards(rng, 3, usedIds);

  // 保留之前已设置的战术风格（避免被默认值 null 覆盖）
  const prevAStyle = state.match?.aStyle || null;
  const prevBStyle = state.match?.bStyle || null;

  state.match = {
    // ── 基础状态 ──
    tickMinute: 0,         // 当前分钟 0-90+
    phase: 'match_draw',   // match_draw → match_important → fast → ... → finished / penalty
    mode: 'fast',          // 'fast' | 'important'
    ag: 0, bg: 0,         // 当前比分

    // ── 手牌 ──
    aDraw: aDraw.map(c => c.id),
    bDraw: bDraw.map(c => c.id),
    aChoice: null, bChoice: null,   // 当前轮出的牌
    aPlayed: [], bPlayed: [],      // 本场已打出的牌
    aPending: [], bPending: [],     // 待激活的修正牌

    // ── 战术风格（实时） ──
    aStyle: prevAStyle, bStyle: prevBStyle,

    // ── 重要/快进窗口 ──
    modeStartMin: 0,       // 当前 mode 起始分钟
    importantEvents: [],    // 播报事件列表 [{min, type, text, side}]

    // ── 每分钟 Bernoulli 概率累计 ──
    bernoulliAccumA: 0,    // A 方本轮 Bernoulli 累计值（>1 才算进 1 球）
    bernoulliAccumB: 0,

    // ── 点球大战 ──
    penalty: null,
  };
  state.phase = 'match';
  state.logs = state.logs || [];
}

// ─── 战术风格效果 ───
export function stylePhaseBonus(styleId, tickMinute) {
  const style = STYLE_BY_ID[styleId];
  if (!style) return { selfPaper: 0, selfChem: 0 };
  for (const bonus of style.phaseBonus) {
    if (tickMinute >= bonus.start && tickMinute <= bonus.end) {
      return { selfPaper: bonus.selfPaper || 0, selfChem: bonus.selfChem || 0 };
    }
  }
  return { selfPaper: 0, selfChem: 0 };
}

// ─── 当前激活的修正牌效果（每分钟累加） ───
export function activeModifierPower(state, side, tickMinute) {
  const pool = side === 'A' ? state.match.aPending : state.match.bPending;
  let net = 0;
  for (const card of pool) {
    if (tickMinute >= card.windowStart && tickMinute <= card.windowEnd) {
      net += card.netPower;
    }
  }
  return net;
}

// ─── 设置战术风格 ───
export function setTacticalStyle(state, side, styleId) {
  if (side === 'A') state.match.aStyle = styleId;
  else state.match.bStyle = styleId;
  const style = STYLE_BY_ID[styleId];
  state.logs.push({
    type: 'style', side, styleId,
    name: style?.name || styleId,
    desc: style?.desc || '',
    at: Date.now(),
  });
}

// ─── 出牌（双方同时出）───
// cards: { A: cardId | null, B: cardId | null }
export function commitMatchCards(state, cards) {
  const { A: aId, B: bId } = cards;
  const m = state.match;
  m.aChoice = aId;
  m.bChoice = bId;
  m.phase = 'reveal';

  // 即时牌：立即推进到 minute
  // 修正牌：加入 pending 池
  if (aId) {
    const card = EVENT_BY_ID[aId];
    if (card?.type === 'instant') {
      // 推进到该分钟
      m.tickMinute = Math.max(m.tickMinute, card.minute);
      m.phase = 'triggered';
    } else if (card?.type === 'modifier') {
      m.aPending.push(card);
    }
  }
  if (bId) {
    const card = EVENT_BY_ID[bId];
    if (card?.type === 'instant') {
      m.tickMinute = Math.max(m.tickMinute, card.minute);
      m.phase = 'triggered';
    } else if (card?.type === 'modifier') {
      m.bPending.push(card);
    }
  }

  // 进入重要模式（系统自动）
  m.mode = 'important';
  m.modeStartMin = m.tickMinute;
  m.phase = 'match_important';
}

// ─── 每分钟 Bernoulli 结算 ───
function tickMinuteBernoulli(state, rng, tick) {
  const m = state.match;
  const am = lineupMetrics(state.lineup.A, state.players);
  const bm = lineupMetrics(state.lineup.B, state.players);

  const aStyleBonus = stylePhaseBonus(m.aStyle, tick);
  const bStyleBonus = stylePhaseBonus(m.bStyle, tick);
  const aModBonus = activeModifierPower(state, 'A', tick);
  const bModBonus = activeModifierPower(state, 'B', tick);

  // 综合实力含风格加成和修正牌
  const aO = am.overall
    + (aStyleBonus.selfPaper + aStyleBonus.selfChem) / 2
    + aModBonus * 0.5;
  const bO = bm.overall
    + (bStyleBonus.selfPaper + bStyleBonus.selfChem) / 2
    + bModBonus * 0.5;

  // Bernoulli 概率（比 Poisson 更适合单次试验）
  // 基础 λ = 0.045，目标：弱队 ≈ 2%，均势 ≈ 4.5%，强队 ≈ 7%
  // 90 分钟 ≈ 4-7 球，加上 style/modifier 后 ≈ 5-9 球（合理）
  const lambda = 0.045 + (aO - bO) / 300;
  const prob = Math.min(0.12, Math.max(0.015, lambda));

  // 独立随机
  if (rng.next() < prob) m.ag++;
  if (rng.next() < Math.min(0.12, Math.max(0.015, 0.045 + (bO - aO) / 300))) m.bg++;

  state.logs.push({
    type: 'tick', tick,
    ag: m.ag, bg: m.bg,
    aO: +aO.toFixed(1), bO: +bO.toFixed(1),
  });
}

// ─── 推进比赛到指定分钟 ───
export function advanceToMinute(state, rng, targetMinute) {
  const m = state.match;
  const start = m.tickMinute;
  for (let t = start + 1; t <= targetMinute && t <= 90; t++) {
    tickMinuteBernoulli(state, rng, t);
  }
  m.tickMinute = Math.min(targetMinute, 90);

  let triggered = false;
  // 即时牌触发（只触发 <= targetMinute 的）
  const trigger = (side, cardId) => {
    if (!cardId) return;
    const card = EVENT_BY_ID[cardId];
    if (!card || card.type !== 'instant') return;
    // 只在 tickMinute 恰好等于 minute 时触发
    if (card.minute === m.tickMinute) {
      triggered = true;
      if (card.instant?.goals) {
        if (side === 'A') m.ag += card.instant.goals;
        else m.bg += card.instant.goals;
      }
      if (card.instant?.oppGoals) {
        if (side === 'A') m.bg += card.instant.oppGoals; // A 出牌削弱对方
        else m.ag += card.instant.oppGoals;
      }
      m.importantEvents.push({
        tick: m.tickMinute,
        type: 'instant',
        text: card.narrate || card.name,
        side,
        cardId,
      });
      // 从 pending 移除（如果误加）
      const pool = side === 'A' ? m.aPending : m.bPending;
      const idx = pool.findIndex(c => c.id === cardId);
      if (idx >= 0) pool.splice(idx, 1);
    }
  };

  // 修正牌激活播报（进入窗口时）
  const prev = start, next = m.tickMinute;
  const reportModifier = (side) => {
    const pool = side === 'A' ? m.aPending : m.bPending;
    for (const card of pool) {
      if (prev < card.windowStart && next >= card.windowStart) {
        triggered = true;
        m.importantEvents.push({
          tick: m.tickMinute,
          type: 'modifier_on',
          text: `↗ ${card.narrate || card.name}`,
          side,
          cardId: card.id,
        });
      }
    }
  };
  reportModifier('A');
  reportModifier('B');

  trigger('A', m.aChoice);
  trigger('B', m.bChoice);

  if (m.aChoice) m.aPlayed.push(m.aChoice);
  if (m.bChoice) m.bPlayed.push(m.bChoice);
  m.aChoice = null;
  m.bChoice = null;
  // 进入重要模式等双方确认；普通推进仍保留 match_draw
  m.phase = triggered ? 'match_important' : 'match_draw';
  m.mode = triggered ? 'important' : 'fast';

  // 判定是否结束
  if (m.tickMinute >= 90) {
    // 修正牌：延长补时（+4分钟上限）
    // 先找最大 minuteEnd
    const maxEnd = Math.max(
      ...m.aPending.map(c => c.windowEnd).filter(Boolean),
      ...m.bPending.map(c => c.windowEnd).filter(Boolean),
      0,
    );
    if (maxEnd > 90) {
      m.tickMinute = maxEnd; // 延到最晚修正牌窗口结束
      m.phase = triggered ? 'match_important' : 'match_draw';
    } else {
      m.phase = 'finished';
    }
  }
}

// ─── 重要模式自动播报进球事件 ───
export function getMatchSnapshot(state) {
  const m = state.match;
  return {
    tickMinute: m.tickMinute,
    ag: m.ag,
    bg: m.bg,
    mode: m.mode,
    aStyle: m.aStyle,
    bStyle: m.bStyle,
    aHand: m.aDraw.filter(id => !m.aPlayed.includes(id)),
    bHand: m.bDraw.filter(id => !m.bPlayed.includes(id)),
    aChoice: m.aChoice,
    bChoice: m.bChoice,
    importantEvents: m.importantEvents,
    phase: m.phase,
  };
}

// ─── 点球大战 ───
export function startPenaltyShootout(state, rng) {
  const am = lineupMetrics(state.lineup.A, state.players);
  const bm = lineupMetrics(state.lineup.B, state.players);
  // GK 能力用 GK 位的 rating
  const aGK = state.lineup.A?.GK ? (state.lineup.A.GK === COURTOIS.id ? 90 : (state.players.find(p => p.id === state.lineup.A.GK)?.rating || 85)) : 85;
  const bGK = state.lineup.B?.GK ? (state.lineup.B.GK === COURTOIS.id ? 90 : (state.players.find(p => p.id === state.lineup.B.GK)?.rating || 85)) : 85;

  const rounds = [];
  let aScore = 0, bScore = 0;
  let aShots = 0, bShots = 0;
  let aFirst = rng.next() < 0.5 ? 'A' : 'B'; // 先踢方

  // 5 轮标准点球
  for (let i = 0; i < 5; i++) {
    const aShoot = aFirst === 'A' ? i === 0 : i === 1;
    const aKick = aShoot; // A 先踢 = i%2===0

    // 点球成功率：进攻方 overall / GK 能力差
    const kickerO = aKick ? am.overall : bm.overall;
    const gkR = aKick ? bGK : aGK;
    const saveProb = Math.min(0.6, Math.max(0.1, gkR / 180));
    const goalProb = Math.min(0.85, Math.max(0.5, kickerO / 120 - saveProb + 0.4));

    const aGoal = aKick ? (rng.next() < goalProb) : false;
    const bGoal = !aKick ? (!aKick && rng.next() < goalProb) : false;

    if (aKick) { aScore += aGoal ? 1 : 0; aShots++; }
    else { bScore += bGoal ? 1 : 0; bShots++; }

    rounds.push({
      round: i + 1,
      aGoal: aKick ? aGoal : null,
      bGoal: !aKick ? bGoal : null,
    });

    // 提前结束判断
    const remainingB = 5 - bShots;
    const remainingA = 5 - aShots;
    if (aScore > bScore + remainingB) break;
    if (bScore > aScore + remainingA) break;
  }

  state.match.penalty = { aScore, bScore, rounds, winner: aScore > bScore ? 'A' : 'B' };
  state.logs.push({ type: 'penalty', aScore, bScore, winner: state.match.penalty.winner });
}

// ─── 结束 90 分钟 ───
export function finishMatch90(state) {
  const m = state.match;
  if (m.ag === m.bg) {
    // 平局：进入点球
    state.phase = 'penalty';
  } else {
    state.phase = 'result';
  }
}

// ─── 最终结算 ───
export function resolveMatch90(state) {
  const m = state.match;
  const am = lineupMetrics(state.lineup.A, state.players);
  const bm = lineupMetrics(state.lineup.B, state.players);

  let winner = 'DRAW';
  if (m.penalty) {
    winner = m.penalty.winner;
  } else if (m.ag > m.bg) {
    winner = 'A';
  } else if (m.bg > m.ag) {
    winner = 'B';
  } else {
    // 无点球则纸面+化学判胜负
    winner = am.overall > bm.overall ? 'A' : am.overall < bm.overall ? 'B' : (am.chemistry >= bm.chemistry ? 'A' : 'B');
  }

  const winSide = winner === 'A' ? state.lineup.A : state.lineup.B;
  const wm = winner === 'A' ? am : bm;
  const mvp = SLOT_ORDER
    .map(slot => winSide[slot] ? (winSide[slot] === COURTOIS.id ? COURTOIS : state.players.find(p => p.id === winSide[slot])) : null)
    .filter(p => p && p.position !== 'GK')
    .map(p => ({ p, score: p.rating + wm.chemistry * 0.05 + Math.random() * 3 }))
    .sort((a, b) => b.score - a.score)[0]?.p;

  state.result = {
    winner,
    ag: m.ag,
    bg: m.bg,
    penalty: m.penalty || null,
    metrics: { A: am, B: bm },
    mvpId: mvp?.id || null,
    style: { A: m.aStyle, B: m.bStyle },
    importantEvents: m.importantEvents,
    logs: state.logs,
  };
  state.phase = 'RESULT';
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
    match: state.match,
    result: state.result,
    activeSide: activeSide(state),
    logs: state.logs,
  };
}
