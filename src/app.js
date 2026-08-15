import { PLAYER_DATA } from '../data/players.js';
import { OnlineClient } from './online.js';
import { COUNTRY_ZH, CLUB_ZH, LEAGUE_ZH } from '../data/i18n.js';
import { NAME_ZH, NAME_ZH_EXTRA } from '../data/names-zh.js';

const app = document.querySelector('#app');
const ACTIVE_KEY = 'football-bp-active-v1';
const HISTORY_KEY = 'football-bp-history-v1';
const RULE_VERSION = 2;
// 6轮规则：前4轮每轮选2人（16人卡池），后2轮每轮选1人（12人卡池）
// 轮次结构：type='double'(选2人) 或 'single'(选1人)，category=位置类型，hint=推荐位置
const ROUND_PLAN = [
  { type:'double', category:'FWD', hint:'中锋/前锋' },
  { type:'double', category:'DEF', hint:'后卫' },
  { type:'double', category:'MID', hint:'中场' },
  { type:'double', category:'MID', hint:'中场' },
  { type:'single', category:'DEF', hint:'后卫' },
  { type:'single', category:'FWD', hint:'前锋' },
];
const SLOT_ORDER = ['LW', 'ST', 'RW', 'CM1', 'CDM', 'CM2', 'LB', 'CB1', 'CB2', 'RB', 'GK'];
const SLOT_LABELS = { LW: '左边锋', ST: '中锋', RW: '右边锋', CM1: '中前卫', CDM: '后腰', CM2: '中前卫', LB: '左后卫', CB1: '中卫', CB2: '中卫', RB: '右后卫', GK: '门将' };
const POSITION_NAME = { FWD: '前锋', MID: '中场', DEF: '后卫', GK: '门将' };
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
    const size = round.type === 'double' ? 16 : 12;
    const pool = generateRoundPool(round.category, size, used);
    rounds.push({ type: round.type, category: round.category, hint: round.hint, candidates: pool });
    pool.forEach(id => used.add(id));
  }
  return rounds;
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
    // double轮次状态：阶段 = prePick(各选1人) -> ban(轮流ban) -> postPick(再各选1人)
    // single轮次状态：阶段 = ban(6次ban) -> pick(各选1人)
    subPhase: null,
    banTurn: 0,
    firstBan: 'PLAYER', // 用于double轮的ban阶段；single轮独立
    selected: null,
    candidates: [],
    bans: { PLAYER: [], AI: [] }, // 所有禁用
    roundBans: [], // 当前轮次内已ban
    picks: { PLAYER: [COURTOIS.id], AI: [COURTOIS.id] }, // 已选
    prePicks: [], // double轮：双方先选的人（中间变量）
    log: [],
    snapshots: [],
    lineup: { PLAYER: null, AI: null },
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
  game.candidates = [...roundInfo.candidates];
  game.roundBans = [];
  game.prePicks = [];
  game.banTurn = 0;
  if (roundInfo.type === 'double') {
    game.phase = 'prePick';
    game.subPhase = 'prePick';
    // 先选的一方（玩家选择order=PLAYER时，PLAYER先选）
    game.firstPicker = order;
  } else {
    // single 轮：「先选」= 球员先 pick，「先禁」由 firstPicker 反方担任
    game.phase = 'ban';
    game.subPhase = 'ban';
    game.firstBan = order === 'PLAYER' ? 'AI' : 'PLAYER';
    game.firstPicker = order;
  }
  selectedId = null;
  game.log.push({ type: 'round', round: game.round + 1, info: roundInfo, candidates: [...game.candidates], firstBan: order, mode: roundInfo.type });
  snapshot(`第${game.round+1}轮候选揭晓（${roundInfo.type==='double'?'16人双选':'12人单选'}）`);
  save(); render(); scheduleAI();
}
function currentActor() {
  if (!game) return null;
  const roundInfo = game.rounds && Number.isInteger(game.round) ? game.rounds[game.round] : null;
  if (!roundInfo) return null;
  if (game.subPhase === 'prePick') {
    // 双方轮流选1人，先选者先选第二个
    const taken = (game.prePicks || []).length;
    if (taken === 0) return game.firstPicker || 'PLAYER';
    return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
  }
  if (game.subPhase === 'ban') {
    return game.banTurn % 2 === 0 ? game.firstBan : (game.firstBan === 'PLAYER' ? 'AI' : 'PLAYER');
  }
  if (game.subPhase === 'postPick') {
    // postPick：先选者先选（与prePick一致）
    // prePick已经2人（prePicks[0..1]），postPick不存prePicks，而是用专门的 postPicks
    const postTaken = (game.postPicks || []).length;
    if (postTaken === 0) return game.firstPicker || 'PLAYER';
    return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
  }
  if (game.subPhase === 'pick') {
    // single 轮的 pick 阶段：双方轮流各选 1 人
    const postTaken = (game.postPicks || []).length;
    if (postTaken === 0) return game.firstPicker || 'PLAYER';
    return game.firstPicker === 'PLAYER' ? 'AI' : 'PLAYER';
  }
  return null;
}
function available() {
  const removed = new Set([
    ...((game.roundBans || []).map(x=>x.id)),
    ...(game.prePicks || []),
    ...(game.postPicks || []),
  ]);
  return (game.candidates || []).filter(id => !removed.has(id));
}
function confirmPlayerAction() {
  if (!selectedId || currentActor() !== 'PLAYER') return;
  if (game.subPhase === 'prePick' || game.subPhase === 'postPick') {
    applyPrePick('PLAYER', selectedId, '玩家选择');
  } else if (game.subPhase === 'ban') {
    applyBan('PLAYER', selectedId, '玩家决策');
  } else if (game.subPhase === 'pick') {
    applyPick('PLAYER', selectedId, '玩家选择');
  }
}
function applyPrePick(actor, id, reason) {
  if (!available().includes(id)) return;
  if (game.subPhase === 'prePick') {
    if (!game.prePicks) game.prePicks = [];
    game.prePicks.push(id);
    game.picks[actor].push(id);
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
    game.log.push({ type: 'postPick', round: game.round + 1, actor, id, reason });
    beep('select');
    snapshot(`${actor==='PLAYER'?'玩家':'AI'}再选${nameZh(player(id))}`);
    if (actor === 'PLAYER') maybePlayChemistry(id);
    if (game.postPicks.length >= 2) {
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
  const roundInfo = game.rounds[game.round];
  if (roundInfo.type === 'double') {
    // double轮：ban3次后切换到postPick
    if (game.banTurn >= 6) {
      game.subPhase = 'postPick';
      game.phase = 'postPick';
      game.postPicks = [];
      // 进入postPick阶段
    }
  } else {
    // single轮：ban6次后切换到pick（各选1人）。firstPicker 已在 beginRound 中按 order 锁定。
    if (game.banTurn >= 6) {
      game.subPhase = 'pick';
      game.phase = 'pick';
      game.postPicks = [];
    }
  }
  save(); render(); scheduleAI();
}
function applyPick(actor, id, reason) {
  // single轮的pick阶段（保兼容）
  if (!available().includes(id) || game.subPhase !== 'pick') return;
  if (!game.postPicks) game.postPicks = [];
  game.postPicks.push(id);
  game.picks[actor].push(id);
  game.log.push({ type: 'pick', round: game.round + 1, actor, id, reason });
  selectedId = null;
  beep('select');
  snapshot(`${actor==='PLAYER'?'玩家':'AI'}选择${nameZh(player(id))}`);
  if (actor === 'PLAYER') maybePlayChemistry(id);
  if (game.postPicks.length >= 2) {
    game.subPhase = 'summary';
    game.phase = 'summary';
    save(); render();
  } else {
    save(); render(); scheduleAI();
  }
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
function aiChoice(action) {
  const ids = available();
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
      const id = aiChoice(action);
      if (!id) return;
      const p = player(id);
      const reason = sub === 'ban'
        ? (p.rating >= 88 ? '高评分威胁' : (game.settings.personality === 'counter' ? '阻断你的组合' : '控制候选池'))
        : (p.rating >= 88 ? '纸面核心' : (game.settings.personality === 'chemistry' ? '增强化学反应' : '提升综合实力'));
      if (sub === 'prePick' || sub === 'postPick') {
        applyPrePick('AI', id, reason);
      } else if (sub === 'ban') {
        applyBan('AI', id, reason);
      } else if (sub === 'pick') {
        applyPick('AI', id, reason);
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
  const used = new Set();
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
  const entries = SLOT_ORDER.map(slot => ({slot, p: player(assignment[slot]), fit: roleFit(player(assignment[slot]), slot)}));
  const lineAverage = line => {
    const rows = entries.filter(x => x.p.position === line);
    if (rows.length === 0) return 0;
    return rows.reduce((s,x) => s + x.p.rating * x.fit, 0) / rows.length;
  };
  // paper: 0-100 制
  const paper = lineAverage('GK')*.1 + lineAverage('DEF')*.3 + lineAverage('MID')*.3 + lineAverage('FWD')*.3;
  const nonGk = entries.filter(x => x.slot !== 'GK');
  const slotFit = nonGk.reduce((s,x) => s + x.fit, 0) / 10 * 32;
  const roles = {FWD:['LW','ST','RW'], MID:['CM1','CDM','CM2'], DEF:['LB','CB1','CB2','RB']};
  let template = 0;
  Object.values(roles).forEach(slots => {
    if (slots.every(slot => roleFit(player(assignment[slot]), slot) >= .96)) template += 8/3;
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
  const gap = Math.max(...ratings) - Math.min(...ratings);
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
function finalizeLineups() { game.lineup.PLAYER = bestAssignment(game.picks.PLAYER); game.lineup.AI = bestAssignment(game.picks.AI); game.phase = 'lineup'; game.screen = 'lineup'; snapshot('阵容自动排布'); save(); render(); }
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
function normalRandom() { const u=1-rng(),v=1-rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function poisson(lambda) { const l=Math.exp(-lambda);let p=1,k=0;do{k++;p*=rng();}while(p>l&&k<10);return k-1; }
function playSeries() {
  const pm=lineupMetrics(game.lineup.PLAYER), am=lineupMetrics(game.lineup.AI); const matches=[]; let pw=0,aw=0;
  for(let i=0;i<3&&pw<2&&aw<2;i++) { const home=i===0?1:i===1?-1:0; const pVar=normalRandom()*2*(1-pm.chemistry/180), aVar=normalRandom()*2*(1-am.chemistry/180); const ps=pm.overall+pVar+Math.max(0,home), as=am.overall+aVar+Math.max(0,-home); const pg=poisson(Math.max(.25,1.35*Math.exp((ps-as)/16))),ag=poisson(Math.max(.25,1.35*Math.exp((as-ps)/16))); let winner='DRAW';if(pg>ag){pw++;winner='PLAYER';}else if(ag>pg){aw++;winner='AI';}matches.push({pg,ag,venue:i===0?'玩家主场':i===1?'AI主场':'中立场',winner}); }
  let winner=pw>aw?'PLAYER':'AI'; if(Math.abs(pm.overall-am.overall)<=.5&&pw===aw)winner=pm.chemistry>=am.chemistry?'PLAYER':'AI';
  const winning=winner==='PLAYER'?game.lineup.PLAYER:game.lineup.AI; const wm=winner==='PLAYER'?pm:am; const mvp=SLOT_ORDER.map(slot=>player(winning[slot])).filter(p=>p.position!=='GK').map(p=>({p,score:p.rating+(p.club?2:0)+wm.chemistry*.05+rng()*3})).sort((a,b)=>b.score-a.score)[0].p;
  game.result={winner,pw,aw,matches,metrics:{PLAYER:pm,AI:am},mvp:mvp.id}; game.phase='result'; game.screen='result'; snapshot('三局两胜结算');
  const record={id:Date.now(),date:new Date().toISOString(),version:RULE_VERSION,seed:game.seed,settings:game.settings,winner,pw,aw,matches,metrics:game.result.metrics,mvp:mvp.id,picks:clone(game.picks),lineup:clone(game.lineup),log:clone(game.log),snapshots:clone(game.snapshots),players:game.players.filter(p=>[...game.picks.PLAYER,...game.picks.AI].includes(p.id))}; storeHistory(record); localStorage.removeItem(ACTIVE_KEY); beep(winner==='PLAYER'?'win':'lose'); render();
}
function setScreen(screen) { game ||= {}; game.screen=screen; render(); }
function reset() { clearTimeout(aiTimer); game=null; selectedId=null; localStorage.removeItem(ACTIVE_KEY); render(); }
function rematch() { const s={...game.settings}; newGame(s); }

function card(id, {disabled=false, selected=false, clickable=true} = {}) {
  const p = player(id);
  const threat = (game?.subPhase === 'ban' && game.picks.PLAYER.length > 1)
    ? `化学预估 +${Math.max(0,Math.round(candidateThreat(id,'PLAYER','pick')-p.rating))}～+${Math.max(2,Math.round(candidateThreat(id,'PLAYER','pick')-p.rating)+3)}`
    : '';
  return `<button class="player-card grade-${p.grade} ${disabled?'disabled':''} ${selected?'selected':''}" data-card="${id}" ${disabled||!clickable?'disabled':''}><span class="card-grade">${p.grade}</span><b class="card-rating">${p.rating}</b><span class="avatar">${esc((p.name||p.englishName).slice(0,1))}</span><strong>${esc(p.name)}</strong><small>${esc(p.englishName||'')}</small><div>${esc(p.club)} · ${esc(p.league)}</div><div>${esc(p.country)} · ${esc(p.detailedPosition||p.position)}</div>${threat?`<em>${threat}</em>`:''}</button>`;
}
function roster(side) {
  const picks = game.picks[side];
  const total = 10;
  const remaining = Math.max(0, total - (picks.length - 1));
  const assignment = assignToSlots(picks);
  const slots = side === 'AI' ? [...SLOT_ORDER].reverse() : SLOT_ORDER;
  const dirClass = side === 'AI' ? 'pitch-reverse' : '';
  return `<aside class="roster ${side.toLowerCase()}"><h3>${side==='PLAYER'?'你的阵容':'AI阵容'}</h3><div class="roster-score">当前纸面 ${currentPaper(side).toFixed(1)}</div><div class="pitch side-pitch ${dirClass}"><div class="pitch-half pitch-def"></div><div class="pitch-half pitch-mid"></div><div class="pitch-half pitch-att"></div><div class="pitch-center"></div>${slots.map(slot => {
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
  const roundInfo = game.rounds[game.round];
  const positionLabel = roundInfo ? POSITION_NAME[roundInfo.category] : '结算';
  const hint = roundInfo?.hint || '';
  const roundNo = Math.min(game.round + 1, game.rounds.length);
  return `<header class="app-header"><div class="logo">DRAFT<span>XI</span></div><div class="round-meta">第 ${roundNo} / ${game.rounds.length} 轮 · ${positionLabel} <small>${hint}</small></div><button class="ghost" data-home>退出</button></header>`;
}
function menu() { const active=localStorage.getItem(ACTIVE_KEY); return `<div class="landing"><div class="landing-copy"><span class="kicker">BAN · PICK · BUILD</span><h1>禁掉威胁<br><em>选出你的最强十一人</em></h1><p>十轮足球BP。每轮12人、六次禁用、双方各取一人。纸面实力与化学反应共同决定三局两胜。</p><div class="menu-actions"><button class="primary" data-new>开始人机对战</button><button class="accent" data-online>好友在线对战</button>${active?'<button data-resume>继续未完成对局</button>':''}<button data-history>最近20局</button><a href="legacy/index.html">旧经营模式</a></div></div><div class="hero-board"><div class="versus"><span>YOU</span><b>VS</b><span>AI / 好友</span></div><div class="rule-cards"><article><b>12</b><span>每轮候选</span></article><article><b>6</b><span>交替禁用</span></article><article><b>11</b><span>最终阵容</span></article></div></div></div>`; }
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
  return `<div class="setup-page"><section><span class="kicker">MATCH SETTINGS</span><h1>创建人机对局</h1><label>AI难度<select id="difficulty"><option value="easy">简单 · 30%失误</option><option value="normal" selected>普通 · 15%失误</option><option value="hard">困难 · 五步评估</option></select></label><label>AI性格<select id="personality"><option value="power">实力型</option><option value="chemistry">化学反应型</option><option value="counter">针对型</option></select></label><label>动画速度<select id="speed"><option value="fast">快速</option><option value="normal" selected>正常</option><option value="slow">慢速</option></select></label><label class="check"><input id="audio" type="checkbox" checked> 开启基础音效</label><button class="primary" data-start>进入BP</button><button data-cancel>返回</button></section><aside><h2>固定规则</h2><p>4-3-3 · 双方固定90分库尔图瓦</p><p>综合实力 = (纸面 + 化学) / 2</p><p>共6轮：前4轮双选16人卡池，后2轮单选12人卡池</p><p>玩家每轮自由选择先选或后选</p><p>先选者获得先禁权</p></aside></div>`;
}
function orderScreen() {
  const roundInfo = game.rounds[game.round];
  const isDouble = roundInfo.type === 'double';
  const desc = isDouble
    ? '本轮双选：16人卡池，先各自选1人，然后轮流ban 3次（共6ban），最后再各选1人。先选者可获得先禁权。'
    : '本轮单选：12人卡池，轮流ban 6次，最后再各选1人。';
  return `<div class="game">${header()}<main class="order-choice"><span class="kicker">ROUND ${game.round+1} · ${isDouble?'双选':'单选'}</span><h1>${POSITION_NAME[roundInfo.category]}轮 · 推荐${roundInfo.hint}</h1><p>${desc}</p><div class="choice-grid"><button data-order="PLAYER"><b>我要先选</b><span>优先拿到核心球员</span></button><button class="accent" data-order="AI"><b>我要后选</b><span>观察对手选择后应对</span></button></div><div class="fixed-gk">双方门将已锁定：蒂博·库尔图瓦 · 90</div></main></div>`;
}
function bpScreen() {
  const actor = currentActor();
  const removed = new Set([
    ...game.roundBans.map(x => x.id),
    ...(game.prePicks || []),
    ...(game.postPicks || []),
  ]);
  const sub = game.subPhase;
  let title, desc;
  if (sub === 'prePick') {
    const taken = (game.prePicks || []).length;
    title = '初始选择';
    desc = `请选择你的核心球员（第${taken+1}/2人）`;
  } else if (sub === 'ban') {
    const roundInfo = game.rounds[game.round];
    const banTotal = roundInfo.type === 'double' ? 6 : 6;
    title = '禁用阶段';
    desc = `第${game.banTurn+1}/${banTotal}禁用 · 阻止对手选到强力球员`;
  } else if (sub === 'postPick') {
    const taken = (game.postPicks || []).length;
    title = '二次选择';
    desc = `请选择剩余强力球员（第${taken+1}/2人）`;
  } else if (sub === 'pick') {
    const taken = (game.postPicks || []).length;
    title = '选择阶段';
    desc = `请从${available().length}人中选择（第${taken+1}/2人）`;
  }
  const actionText = (sub === 'prePick' || sub === 'postPick' || sub === 'pick') ? '选择' : '禁用';
  return `<div class="game">${header()}<div class="bp-layout">${roster('PLAYER')}<main class="board"><div class="turn-banner ${actor?.toLowerCase()}"><b>${actor==='PLAYER'?'你的回合':'AI思考中'}</b><span>${title} · ${desc}</span></div>${bansPanel()}<div class="candidate-grid">${game.candidates.map(id => card(id, {disabled: removed.has(id), selected: selectedId === id, clickable: actor === 'PLAYER'})).join('')}</div><footer><span>${selectedId ? `已选中：${esc(player(selectedId).name)}` : '先查看卡牌信息，再确认操作'}</span><button class="primary" data-confirm ${!selectedId || actor !== 'PLAYER' ? 'disabled' : ''}>确认${actionText}</button></footer></main>${roster('AI')}</div></div>`;
}
function summaryScreen() {
  const roundInfo = game.rounds[game.round];
  const isDouble = roundInfo.type === 'double';
  const pp = (game.prePicks && game.postPicks) ? [...game.prePicks, ...game.postPicks] : [];
  const preP = (game.prePicks || []).map(id => ({actor: id === (game.prePicks?.[0]) ? 'PLAYER' : 'AI', id}));
  const postP = (game.postPicks || []).map(id => ({actor: id === (game.postPicks?.[0]) ? 'PLAYER' : 'AI', id}));
  const playerPicks = [...preP, ...postP].filter(x => x.actor === 'PLAYER').map(x => x.id);
  const aiPicks = [...preP, ...postP].filter(x => x.actor === 'AI').map(x => x.id);
  const cardList = ids => ids.map(id => card(id, {clickable: false})).join('');
  return `<div class="game">${header()}<main class="round-summary"><span class="kicker">ROUND COMPLETE</span><h1>第${game.round+1}轮选人完成${isDouble?'（双选）':'（单选）'}</h1><div class="duel-picks"><article><h3>你的选择</h3>${cardList(playerPicks)}</article><b>VS</b><article><h3>AI选择</h3>${cardList(aiPicks)}</article></div><div class="summary-stats"><span>你的纸面 ${currentPaper('PLAYER').toFixed(1)}</span><span>AI纸面 ${currentPaper('AI').toFixed(1)}</span><span>下一轮 ${game.round < game.rounds.length - 1 ? POSITION_NAME[game.rounds[game.round+1].category] : '阵容排布'}</span></div><button class="primary" data-next>${game.round < game.rounds.length - 1 ? '进入下一轮' : '进入阵容调整'}</button></main></div>`;
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
  return `<div class="game">${header()}<main class="lineup-page"><div class="section-title"><div><span class="kicker">FINAL LINEUP</span><h1>两军对垒 · 4-3-3</h1><p>双方阵容已由系统自动排出最优布局。你可以在结果页查看完整球员明细。</p></div><button class="primary" data-play>确认阵容并开始三局两胜</button></div><div class="lineup-compare"><section class="lineup-side lineup-player"><header><h2>玩家阵容</h2><span class="side-score">综合 ${lineupMetrics(game.lineup.PLAYER).overall.toFixed(1)}</span></header>${pitch('PLAYER', 'normal')}${metricPanel('PLAYER')}</section><section class="lineup-side lineup-ai"><header><h2>AI阵容</h2><span class="side-score">综合 ${lineupMetrics(game.lineup.AI).overall.toFixed(1)}</span></header>${pitch('AI', 'reverse')}${metricPanel('AI')}</section></div></main></div>`;
}
function resultScreen() { const r=game.result,win=r.winner==='PLAYER'; return `<div class="game result-page">${header()}<main><span class="kicker">BEST OF THREE</span><h1>${win?'你赢得了对局':'AI赢得了对局'}</h1><div class="series-score"><b>${r.pw}</b><span>:</span><b>${r.aw}</b></div><div class="matches">${r.matches.map((m,i)=>`<article><small>第${i+1}场 · ${m.venue}</small><strong>${m.pg} : ${m.ag}</strong></article>`).join('')}</div><div class="result-metrics">${metricPanel('PLAYER')}${metricPanel('AI')}</div><div class="mvp">本局MVP <strong>${esc(nameZh(player(r.mvp)))}</strong></div><div class="menu-actions"><button class="primary" data-rematch>再来一局</button><button data-lineups>查看阵容</button><button data-replay>查看BP回放</button><button data-home>返回主菜单</button></div></main></div>`; }
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
  const nonGk=entries.filter(x=>x.slot!=='GK'&&x.p);const slotFit=nonGk.reduce((sum,x)=>sum+x.fit,0)/10*32;
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
      online.state = { code, you: side };
      history.replaceState(null,'',`?room=${code}`);
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
  }).catch(()=>{
    online.error='无法连接服务器，请确认使用 npm start 启动';
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
  
  // 等待好友加入界面
  if(!m) {
    const roomUrl = `${location.origin}${location.pathname}?room=${room.code}`;
    return `<div class="online-wait">
    <div class="wait-header">
      <span class="kicker">ROOM ${room.code}</span>
      <h1>等待好友加入</h1>
    </div>
    
    <div class="room-code-display">
      <div class="room-code-label">房间码</div>
      <div class="room-code-number">${room.code.split('').join(' ')}</div>
    </div>
    
    <div class="invite-section">
      <p class="invite-tip">复制以下链接发送给好友，好友可直接加入：</p>
      <div class="invite-link-box">
        <input readonly value="${esc(roomUrl)}" id="invite-link">
        <button class="primary" data-copy-link>复制链接</button>
      </div>
    </div>
    
    <div class="players-status">
      <div class="player-status ${players.A?.connected ? 'connected' : 'waiting'}">
        <span class="status-dot"></span>
        <span class="player-name">${esc(players.A?.nickname || '房主')}</span>
        <span class="player-role">房主${you === 'A' ? ' · 你' : ''}</span>
      </div>
      ${players.B ? `
        <div class="player-status ${players.B.connected ? 'connected' : 'waiting'}">
          <span class="status-dot"></span>
          <span class="player-name">${esc(players.B.nickname)}</span>
          <span class="player-role">访客</span>
        </div>
      ` : `
        <div class="player-status waiting">
          <span class="status-dot blink"></span>
          <span class="player-name">等待加入...</span>
        </div>
      `}
    </div>
    
    <div class="wait-actions">
      ${players.B ? '<p class="opponent-joined">好友已加入！即将开始...</p>' : ''}
      <button data-online-leave>离开房间</button>
    </div>
  </div>`;
  }
  
  const availableIds = (() => {
    const removed = new Set([
      ...(m.roundBans || []).map(item => item.id),
      ...(m.prePicks || []),
      ...(m.postPicks || []),
    ]);
    return (m.candidates || []).filter(id => !removed.has(id));
  })();
  
  const cards = (m.candidates || []).map(id => onlineCard(id,{disabled:!availableIds.includes(id),selected:selectedId===id,clickable:m.activeSide===you,ownIds:m.picks[you]||[]})).join('');
  
  const deadline = state.deadline ? Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)) : 0;
  const activeSide = m.phase === 'ORDER' ? state.choiceOwner : m.activeSide;
  const isYourTurn = activeSide === you;
  const pickPhase = ['PRE_PICK','POST_PICK','PICK'].includes(m.phase);
  const phaseLabel = m.phase === 'ORDER' ? '选择本轮先后手' : m.phase === 'PRE_PICK' ? '先选1人' : m.phase === 'BAN' ? `第${m.banCount+1}/6次禁用` : m.phase === 'POST_PICK' ? '再选1人' : m.phase === 'PICK' ? '双方各选1人' : m.phase === 'ROUND_END' ? '本轮完成' : m.phase === 'LINEUP' ? '确认阵容' : m.phase === 'RESULT' ? '比赛结束' : '进行中';
  
  const enemySide = you==='A'?'B':'A';
  const rosterOnline = (side,reverse=false) => onlineRoster(side,{...m,viewer:you},players,reverse);
  const roundPickIds = side => [...(m.prePicks||[]),...(m.postPicks||[])].filter(id=>(m.pickOwners||{})[id]===side);
  const onlineHeader = `<header class="app-header"><div class="logo">好友<span>对战</span></div><div class="round-meta">房间 ${room.code} · 第 ${Math.min(m.round+1,6)} / 6 轮<small>${m.roundType==='double'?'双选':'单选'} · 推荐${esc(m.roundHint||'')} · ${deadline}秒</small></div><button data-online-leave>退出</button></header>`;

  if(m.phase==='LINEUP') return `<div class="game">${onlineHeader}<main class="lineup-page"><div class="section-title"><div><span class="kicker">最终阵容</span><h1>两军对垒 · 4-3-3</h1><p>双方阵容已自动排出最优布局。纸面实力与化学反应共同决定比赛结果。</p></div><button class="primary" data-online-lineup-ready>确认阵容并开始三局两胜</button></div><div class="lineup-compare"><section class="lineup-side lineup-player"><header><h2>${esc(players.A?.nickname||'玩家A')}阵容</h2></header>${onlinePitch(m.picks.A||[],false)}${onlineMetricPanel(m.picks.A||[])}</section><section class="lineup-side lineup-ai"><header><h2>${esc(players.B?.nickname||'玩家B')}阵容</h2></header>${onlinePitch(m.picks.B||[],true)}${onlineMetricPanel(m.picks.B||[])}</section></div></main></div>`;
  if(m.phase==='RESULT') {const winsA=(m.matches||[]).filter(match=>match.playerGoals>match.aiGoals).length,winsB=(m.matches||[]).length-winsA;return `<div class="game result-page">${onlineHeader}<main><span class="kicker">三局两胜</span><h1>${m.winner===you?'你赢得了对局':`${esc(players[m.winner]?.nickname||'对手')}赢得了对局`}</h1><div class="series-score"><b>${winsA}</b><span>:</span><b>${winsB}</b></div><div class="matches">${(m.matches||[]).map((match,i)=>`<article><small>第${i+1}场 · ${i===0?'玩家A主场':i===1?'玩家B主场':'中立场'}</small><strong>${match.playerGoals} : ${match.aiGoals}</strong></article>`).join('')}</div><div class="result-metrics">${onlineMetricPanel(m.picks.A||[])}${onlineMetricPanel(m.picks.B||[])}</div><div class="menu-actions"><button class="primary" data-online-rematch>再来一局</button><button data-online-leave>返回主菜单</button></div></main></div>`;}
  if(m.phase==='ROUND_END'){const mine=roundPickIds(you),enemy=roundPickIds(you==='A'?'B':'A');return `<div class="game">${onlineHeader}<main class="round-summary"><span class="kicker">本轮完成</span><h1>第${m.round+1}轮选人完成${m.roundType==='double'?'（双选）':'（单选）'}</h1><div class="duel-picks"><article><h3>你的选择</h3>${mine.map(id=>onlineCard(id,{clickable:false})).join('')}</article><b>VS</b><article><h3>对手选择</h3>${enemy.map(id=>onlineCard(id,{clickable:false})).join('')}</article></div><div class="summary-stats"><span>你的纸面 ${onlinePaper(m.picks[you]||[]).toFixed(1)}</span><span>对手纸面 ${onlinePaper(m.picks[you==='A'?'B':'A']||[]).toFixed(1)}</span><span>下一轮 ${m.round<5?POSITION_NAME[m.rounds[m.round+1].category]:'阵容排布'}</span></div><button class="primary" data-online-next>确认并继续</button><p>双方确认后进入下一轮</p></main></div>`;}
  
  return `<div class="game">
    <header class="app-header">
      <div class="logo">ONLINE<span>XI</span></div>
      <div class="round-meta">房间 ${room.code} · 第${Math.min(m.round+1,6)} / 6轮<small>${m.roundType==='double'?'16人双选':'12人单选'} · ${esc(m.roundHint||'')} · ${deadline}秒</small></div>
      <button data-online-leave>退出</button>
    </header>
    <div class="online-status">
      <span class="${players.A?.connected?'connected':'disconnected'}">${players.A?.nickname || '玩家A'} · ${players.A?.connected?'在线':'掉线'}</span>
      <span class="${players.B?.connected?'connected':'disconnected'}">${players.B?.nickname || '玩家B'} · ${players.B?.connected?'在线':'掉线'}</span>
    </div>
    <div class="bp-layout">
      ${rosterOnline(you,false)}
      <main class="board">
        <div class="turn-banner ${isYourTurn?'player':'ai'}">
          <b>${isYourTurn?'你的回合':'等待对方'}</b>
          <span>${phaseLabel}</span>
        </div>
        ${m.phase==='ORDER'&&isYourTurn?`<div class="choice-grid online-choice">
          <button data-online-order="first">我先选</button>
          <button class="accent" data-online-order="last">我后选</button>
        </div>`:''}
        <section class="ban-panel"><div class="ban-row"><b>你方禁用</b>${(m.roundBans||[]).filter(item=>item.side===you).map((item,i)=>{const p=onlinePlayer(item.id);return `<div class="ban-item"><span class="ban-idx">${i+1}</span><div class="ban-info"><b>${esc(p.name)}</b><small>${esc(p.club)} · ${esc(p.country)}</small></div><span class="ban-rating">${p.rating}</span></div>`;}).join('')||'<span class="ban-empty">暂无</span>'}</div><div class="ban-row"><b>对手禁用</b>${(m.roundBans||[]).filter(item=>item.side!==you).map((item,i)=>{const p=onlinePlayer(item.id);return `<div class="ban-item"><span class="ban-idx">${i+1}</span><div class="ban-info"><b>${esc(p.name)}</b><small>${esc(p.club)} · ${esc(p.country)}</small></div><span class="ban-rating">${p.rating}</span></div>`;}).join('')||'<span class="ban-empty">暂无</span>'}</div></section>
        <div class="candidate-grid">${cards}</div>
        ${(m.phase==='BAN'||pickPhase)&&isYourTurn?`<footer>
          <span>${selectedId ? esc(nameZh(onlinePlayer(selectedId))) : '请选择球员'}</span>
          <button class="primary" data-online-confirm ${!selectedId?'disabled':''}>确认${m.phase==='BAN'?'禁用':'选择'}</button>
        </footer>`:''}
      </main>
      ${rosterOnline(enemySide,true)}
    </div>
  </div>`;
}
function render() {
  clearTimeout(aiTimer);
  if (!game) { app.innerHTML = menu(); bind(); return; }
  // 状态校验：当前对局阶段缺失必要字段时回到主菜单，避免页面卡死
  const needsRounds = ['order','ban','postPick','prePick','pick','summary','lineup','result'].includes(game.phase);
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
    if ((playerFull && aiFull) && !['lineup','result'].includes(game.phase)) {
      console.warn('[render] both lineups full but phase is', game.phase, '-> auto-finalize');
      try {
        finalizeLineups();
      } catch (e) {
        console.error('[render] finalizeLineups failed:', e);
        // bestAssignment 抛错时仍强制推进到 lineup 阶段，避免 UI 卡住
        game.phase = 'lineup';
        game.screen = 'lineup';
        game.lineup.PLAYER = game.lineup.PLAYER || { GK: COURTOIS.id };
        game.lineup.AI = game.lineup.AI || { GK: COURTOIS.id };
        if (!game.lineup.PLAYER.GK) game.lineup.PLAYER.GK = COURTOIS.id;
        if (!game.lineup.AI.GK) game.lineup.AI.GK = COURTOIS.id;
        for (const slot of SLOT_ORDER) {
          if (!game.lineup.PLAYER[slot]) game.lineup.PLAYER[slot] = game.picks.PLAYER[0] || COURTOIS.id;
          if (!game.lineup.AI[slot]) game.lineup.AI[slot] = game.picks.AI[0] || COURTOIS.id;
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
  else if (game.phase === 'ban' || game.phase === 'prePick' || game.phase === 'postPick' || game.phase === 'pick') html = bpScreen();
  else if (game.phase === 'summary') html = summaryScreen();
  else if (game.phase === 'lineup') html = lineupScreen();
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
    onlineSend('ACTION',{action:phase==='BAN'?'BAN':'PICK',playerId:selectedId});
    selectedId=null;
  });
  document.querySelector('[data-online-next]')?.addEventListener('click',()=>onlineSend('NEXT'));
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
  document.querySelector('[data-play]')?.addEventListener('click',playSeries);
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
