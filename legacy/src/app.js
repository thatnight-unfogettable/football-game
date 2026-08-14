import { PLAYER_DATA } from '../data/players.js';
import { LEAGUES, CLUB_ALIASES, createClubs } from '../data/clubs.js';
import { CONFIG, gradeFromRating, playerValue } from '../data/config.js';

const app = document.querySelector('#app');
const SAVE_PREFIX = 'pitch-card-manager-v1-slot-';
const fmt = (n) => `${Number(n).toFixed(1)}M`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const byId = (state, id) => state.players.find((player) => player.id === id);
const clubById = (state, id) => state.clubs.find((club) => club.id === id);
const leagueById = (id) => LEAGUES.find((league) => league.id === id);
const formValue = (player) => Number.isFinite(player?.form) ? player.form : CONFIG.defaultForm;
const PLAYER_NAME_OVERRIDES = {
  'Kylian Mbappé': '基利安·姆巴佩', 'Rodri': '罗德里', 'Erling Haaland': '埃尔林·哈兰德', 'Jude Bellingham': '裘德·贝林厄姆',
  'Vinícius Júnior': '维尼修斯·儒尼奥尔', 'Kevin De Bruyne': '凯文·德布劳内', 'Harry Kane': '哈里·凯恩', 'Mohamed Salah': '穆罕默德·萨拉赫',
  'Lautaro Martínez': '劳塔罗·马丁内斯', 'Robert Lewandowski': '罗伯特·莱万多夫斯基', 'Thibaut Courtois': '蒂博·库尔图瓦',
  'Virgil van Dijk': '维吉尔·范戴克', 'Alisson': '阿利松', 'Ederson': '埃德森', 'Rúben Dias': '鲁本·迪亚斯', 'Antonio Rüdiger': '安东尼奥·吕迪格',
  'William Saliba': '威廉·萨利巴', 'Federico Valverde': '费德里科·巴尔韦德', 'Martin Ødegaard': '马丁·厄德高', 'Bruno Fernandes': '布鲁诺·费尔南德斯',
  'Bernardo Silva': '贝尔纳多·席尔瓦', 'Bukayo Saka': '布卡约·萨卡', 'Phil Foden': '菲尔·福登', 'Jamal Musiala': '贾马尔·穆西亚拉',
  'Florian Wirtz': '弗洛里安·维尔茨', 'Pedri': '佩德里', 'Gavi': '加维', 'Rodrygo': '罗德里戈', 'Antoine Griezmann': '安托万·格列兹曼',
  'Victor Osimhen': '维克托·奥斯梅恩', 'Khvicha Kvaratskhelia': '赫维恰·克瓦拉茨赫利亚', 'Son Heung Min': '孙兴慜', 'Heung Min Son': '孙兴慜',
  'Cristiano Ronaldo': '克里斯蒂亚诺·罗纳尔多', 'Lionel Messi': '利昂内尔·梅西', 'Neymar Jr': '内马尔', 'Neymar': '内马尔',
  'Declan Rice': '德克兰·赖斯', 'Joshua Kimmich': '约书亚·基米希', 'João Cancelo': '若昂·坎塞洛', 'Achraf Hakimi': '阿什拉夫·哈基米',
  'Theo Hernández': '特奥·埃尔南德斯', 'Mike Maignan': '迈克·迈尼昂', 'Gianluigi Donnarumma': '詹路易吉·多纳鲁马', 'Marc-André ter Stegen': '马克-安德烈·特尔施特根'
};
const SURNAME_TRANSLITERATION = {
  mbappe: '姆巴佩', rodri: '罗德里', haaland: '哈兰德', bellingham: '贝林厄姆', vinicius: '维尼修斯', salah: '萨拉赫', kane: '凯恩', martinez: '马丁内斯',
  silva: '席尔瓦', santos: '桑托斯', souza: '索萨', costa: '科斯塔', oliveira: '奥利维拉', pereira: '佩雷拉', fernandes: '费尔南德斯', rodriguez: '罗德里格斯',
  garcia: '加西亚', gonzalez: '冈萨雷斯', lopez: '洛佩斯', sanchez: '桑切斯', hernandez: '埃尔南德斯', diaz: '迪亚斯', perez: '佩雷斯',
  jimenez: '希门尼斯', ruiz: '鲁伊斯', alvarez: '阿尔瓦雷斯', romero: '罗梅罗', torres: '托雷斯', ramos: '拉莫斯', moreno: '莫雷诺',
  williams: '威廉姆斯', johnson: '约翰逊', smith: '史密斯', jones: '琼斯', brown: '布朗', davies: '戴维斯', wilson: '威尔逊', walker: '沃克',
  miller: '米勒', moore: '穆尔', taylor: '泰勒', anderson: '安德森', thomas: '托马斯', roberts: '罗伯茨', lewis: '刘易斯',
  musiala: '穆西亚拉', wirtz: '维尔茨', kimmich: '基米希', neuer: '诺伊尔', muller: '穆勒', schmidt: '施密特', schneider: '施奈德', wagner: '瓦格纳',
  dubois: '迪布瓦', martin: '马丁', bernard: '贝尔纳', robert: '罗贝尔', richard: '里夏尔', petit: '珀蒂', moreau: '莫罗', laurent: '洛朗',
  rossi: '罗西', russo: '鲁索', ferrari: '费拉里', esposito: '埃斯波西托', bianchi: '比安基', romano: '罗马诺', ricci: '里奇', conti: '孔蒂',
  jensen: '延森', nielsen: '尼尔森', hansen: '汉森', andersen: '安德森', berg: '贝里', lindstrom: '林德斯特伦', de: '德', van: '范',
  junior: '儒尼奥尔', neto: '内托', mendes: '门德斯', nunes: '努内斯', dias: '迪亚斯', cancelo: '坎塞洛', hakimi: '哈基米', osimhen: '奥斯梅恩'
};
function chinesePlayerName(player) {
  const original = player?.englishName || player?.name || '';
  if (PLAYER_NAME_OVERRIDES[original]) return PLAYER_NAME_OVERRIDES[original];
  if (/[\u3400-\u9fff]/.test(player?.name || '')) return player.name;
  const words = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/);
  const translated = words.map((word) => SURNAME_TRANSLITERATION[word.toLowerCase()]).filter(Boolean);
  return translated.length ? translated.join('·') : `球员·${original}`;
}
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
let state = null;
let selectedSlot = 1;
let draftSnapshot = null;
let toast = '';
let synthSelection = [];

function random() {
  let x = state.rngState >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rngState = x >>> 0;
  return state.rngState / 4294967296;
}
function pick(list) { return list[Math.floor(random() * list.length)]; }
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function save(manual = false) {
  if (!state) return;
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(`${SAVE_PREFIX}${state.slot}`, JSON.stringify(state));
  if (manual) notify('存档已保存');
}
function load(slot) {
  const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
  if (!raw) return false;
  try {
    state = JSON.parse(raw);
    state.players.forEach((player) => { if (!Number.isFinite(player.form)) player.form = CONFIG.defaultForm; });
    selectedSlot = slot; render(); return true;
  } catch { localStorage.removeItem(`${SAVE_PREFIX}${slot}`); return false; }
}
function notify(message) { toast = message; render(); setTimeout(() => { toast = ''; document.querySelector('.toast')?.remove(); }, 2200); }
function normalizeClub(name) { return CLUB_ALIASES[name] || name; }
function emptyTable(club) { return { clubId: club.id, name: club.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }; }

function generateSchedule(ids) {
  const teams = [...ids];
  const rounds = [];
  for (let round = 0; round < teams.length - 1; round += 1) {
    const games = [];
    for (let i = 0; i < teams.length / 2; i += 1) {
      let home = teams[i], away = teams[teams.length - 1 - i];
      if ((round + i) % 2) [home, away] = [away, home];
      games.push({ home, away });
    }
    rounds.push(games);
    teams.splice(1, 0, teams.pop());
  }
  return [...rounds, ...rounds.map((games) => games.map(({ home, away }) => ({ home: away, away: home })))];
}

function initializeOwnership(game) {
  const nameMap = new Map(game.clubs.map((club) => [club.name, club]));
  game.players.forEach((player) => {
    player.grade = gradeFromRating(player.rating);
    player.form = CONFIG.defaultForm;
    const club = nameMap.get(normalizeClub(player.club));
    if (club) { player.ownerType = 'CLUB'; player.ownerId = club.id; club.roster.push(player.id); }
    else { player.ownerType = 'FREE'; player.ownerId = null; }
  });
  const free = shuffle(game.players.filter((player) => player.ownerType === 'FREE'));
  const needs = { GK: 2, DEF: 6, MID: 6, FWD: 4 };
  game.clubs.forEach((club) => Object.entries(needs).forEach(([position, count]) => {
    while (club.roster.map((id) => byId(game, id)).filter((player) => player.position === position).length < count) {
      const index = free.findIndex((player) => player.ownerType === 'FREE' && player.position === position);
      if (index < 0) break;
      const player = free.splice(index, 1)[0]; player.ownerType = 'CLUB'; player.ownerId = club.id; club.roster.push(player.id);
    }
  }));
}

function startSetup(slot) {
  selectedSlot = slot;
  const seed = (Date.now() ^ (slot * 2654435761)) >>> 0;
  state = {
    version: 1, slot, rngState: seed || 123456789, phase: 'SETUP', page: 'dashboard', season: 1, week: 1,
    clubName: '新星竞技', colors: ['#42e08b', '#07130e'], leagueId: 'premier', replacedClubId: '',
    cash: CONFIG.startingCash, actions: CONFIG.weeklyActions, fatigue: 0, formation: '4-4-2', familiarity: { '4-4-2': 20, '4-3-3': 0, '4-2-3-1': 0 },
    players: clone(PLAYER_DATA), clubs: createClubs(), owned: [], lineup: [], market: [], schedules: {}, tables: {}, results: [], seasonStats: { wins: 0, draws: 0, losses: 0, goals: 0, trades: 0, streak: 0, bestStreak: 0 },
    sponsor: null, achievements: {}, rewardLog: [], rerolled: false, gameOver: false
  };
  initializeOwnership(state);
  render();
}

function finalizeSetup(form) {
  state.clubName = form.clubName.value.trim() || '新星竞技';
  state.leagueId = form.league.value;
  state.replacedClubId = form.club.value;
  state.colors = [form.primary.value, '#07130e'];
  const replaced = clubById(state, state.replacedClubId);
  replaced.roster.forEach((id) => { const player = byId(state, id); player.ownerType = 'FREE'; player.ownerId = null; });
  replaced.roster = []; replaced.name = state.clubName; replaced.isPlayer = true; replaced.budget = 0;
  draftSnapshot = clone(state);
  performDraft();
}

function performDraft() {
  state.owned = [];
  const positions = Object.entries(CONFIG.initialPositionMix).flatMap(([position, count]) => Array(count).fill(position));
  const gradeSlots = shuffle(Object.entries(CONFIG.initialGradeMix).flatMap(([grade, count]) => Array(count).fill(grade)));
  const usedClubs = new Set();
  positions.forEach((position, index) => {
    const grade = gradeSlots[index];
    let pool = state.players.filter((player) => player.position === position && player.grade === grade && player.ownerType !== 'PLAYER' && (!player.ownerId || !usedClubs.has(player.ownerId)));
    if (!pool.length) pool = state.players.filter((player) => player.position === position && player.ownerType !== 'PLAYER');
    const player = pick(pool);
    if (!player) return;
    if (player.ownerType === 'CLUB') { const oldClub = clubById(state, player.ownerId); oldClub.roster = oldClub.roster.filter((id) => id !== player.id); oldClub.budget += playerValue(player); usedClubs.add(oldClub.id); }
    player.ownerType = 'PLAYER'; player.ownerId = state.replacedClubId; state.owned.push(player.id);
  });
  state.lineup = bestLineup(state.formation);
  state.phase = 'DRAFT';
  render();
}

function rerollDraft() {
  if (state.rerolled) return;
  const rngState = state.rngState;
  state = clone(draftSnapshot);
  state.rngState = rngState;
  state.rerolled = true;
  performDraft();
  state.rerolled = true;
}

function bestLineup(formation = state.formation) {
  const rules = CONFIG.formations[formation];
  return Object.entries(rules).flatMap(([position, count]) => position === 'weights' ? [] : state.owned.map((id) => byId(state, id)).filter((player) => player.position === position).sort((a, b) => b.rating - a.rating).slice(0, count).map((player) => player.id));
}
function isLegalLineup() {
  const rules = CONFIG.formations[state.formation];
  if (new Set(state.lineup).size !== 11) return false;
  return Object.entries(rules).every(([position, count]) => position === 'weights' || state.lineup.map((id) => byId(state, id)).filter((player) => player?.position === position).length === count);
}
function lineupPower(ids = state.lineup, formation = state.formation, fatigue = state.fatigue, familiarity = state.familiarity[formation]) {
  const players = ids.map((id) => byId(state, id)).filter(Boolean);
  const rules = CONFIG.formations[formation];
  let power = 0;
  Object.entries(rules.weights).forEach(([position, weight]) => {
    const group = players.filter((player) => player.position === position);
    const fallback = position === 'GK' ? 58 : 60;
    power += (group.length ? group.reduce((sum, player) => sum + player.rating, 0) / group.length : fallback) * weight;
  });
  return Math.max(35, power + CONFIG.maxFamiliarityBonus * (familiarity / 100) - fatigue * .05);
}
function clubLineup(club) {
  const formation = ({ 442: '4-4-2', 433: '4-3-3', 4231: '4-2-3-1' })[club.formation] || '4-4-2';
  const rules = CONFIG.formations[formation];
  const ids = Object.entries(rules).flatMap(([position, count]) => position === 'weights' ? [] : club.roster.map((id) => byId(state, id)).filter((player) => player?.position === position).sort((a, b) => b.rating - a.rating).slice(0, count).map((player) => player.id));
  return { ids, formation };
}
function clubPower(club) {
  if (club.isPlayer) return lineupPower();
  const { ids, formation } = clubLineup(club);
  return lineupPower(ids, formation, club.fatigue, club.familiarity);
}

function acceptDraft() {
  state.phase = 'SPONSOR';
  state.sponsorChoices = shuffle(CONFIG.sponsors).slice(0, 3);
  render();
}
function chooseSponsor(id) {
  state.sponsor = clone(CONFIG.sponsors.find((sponsor) => sponsor.id === id));
  state.cash += state.sponsor.upfront;
  LEAGUES.forEach((league) => {
    const clubs = state.clubs.filter((club) => club.leagueId === league.id);
    state.schedules[league.id] = generateSchedule(clubs.map((club) => club.id));
    state.tables[league.id] = clubs.map(emptyTable);
  });
  state.phase = 'MANAGEMENT'; refreshMarket(); save(); render();
}

function poisson(lambda) {
  const limit = Math.exp(-lambda); let p = 1, k = 0;
  do { k += 1; p *= random(); } while (p > limit && k < 10);
  return k - 1;
}
function simulateMatch(home, away) {
  const hp = clubPower(home), ap = clubPower(away);
  const hg = poisson(Math.max(.2, Math.min(4, 1.35 * Math.exp((hp - ap) / 18))));
  const ag = poisson(Math.max(.2, Math.min(4, 1.35 * Math.exp((ap - hp) / 18))));
  return { homeId: home.id, awayId: away.id, homeName: home.name, awayName: away.name, hg, ag, upset: (hp - ap > 7 && hg < ag) || (ap - hp > 7 && ag < hg) };
}
function applyResult(result, table) {
  const home = table.find((row) => row.clubId === result.homeId), away = table.find((row) => row.clubId === result.awayId);
  home.p += 1; away.p += 1; home.gf += result.hg; home.ga += result.ag; away.gf += result.ag; away.ga += result.hg;
  if (result.hg > result.ag) { home.w += 1; home.pts += 3; away.l += 1; }
  else if (result.hg < result.ag) { away.w += 1; away.pts += 3; home.l += 1; }
  else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
  home.gd = home.gf - home.ga; away.gd = away.gf - away.ga;
}
function standings(leagueId) { return [...state.tables[leagueId]].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.w - a.w || a.clubId.localeCompare(b.clubId)); }
function clampForm(value) { return Math.max(CONFIG.playerForm.min, Math.min(CONFIG.playerForm.max, value)); }
function updatePlayerForms(outcome) {
  const baseChange = CONFIG.playerForm[outcome] || 0;
  const starters = new Set(state.lineup);
  state.owned.forEach((id) => {
    const player = byId(state, id);
    const change = starters.has(id) ? baseChange + CONFIG.playerForm.starterBonus : CONFIG.playerForm.reserveRecovery;
    if (starters.has(id)) player.form = clampForm((player.form ?? CONFIG.defaultForm) + change);
    else {
      const current = player.form ?? CONFIG.defaultForm;
      const direction = current > CONFIG.playerForm.neutral ? -1 : current < CONFIG.playerForm.neutral ? 1 : 0;
      player.form = clampForm(current + direction * CONFIG.playerForm.reserveRecovery);
    }
  });
}
function formSaleMultiplier(player) {
  const form = player.form ?? CONFIG.defaultForm;
  const ratio = (form - CONFIG.playerForm.min) / (CONFIG.playerForm.max - CONFIG.playerForm.min);
  return CONFIG.saleFormMin + ratio * (CONFIG.saleFormMax - CONFIG.saleFormMin);
}
function salePrice(player) { return Math.round(playerValue(player) * formSaleMultiplier(player) * 10) / 10; }
function formLabel(player) {
  const form = player.form ?? CONFIG.defaultForm;
  if (form >= 90) return '火热'; if (form >= 78) return '出色'; if (form >= 65) return '稳定'; if (form >= 52) return '低迷'; return '糟糕';
}

function playRound() {
  if (!isLegalLineup()) return notify('首发阵容不合法，请按阵型补齐11人');
  const previous = state.lastLineup || [];
  const rotations = state.lineup.filter((id) => !previous.includes(id)).length;
  state.fatigue = Math.max(0, state.fatigue - CONFIG.fatigueRecovery - rotations * CONFIG.rotationRecovery);
  const allResults = [];
  LEAGUES.forEach((league) => {
    const games = state.schedules[league.id][state.week - 1];
    games.forEach(({ home: homeId, away: awayId }) => {
      const result = simulateMatch(clubById(state, homeId), clubById(state, awayId));
      applyResult(result, state.tables[league.id]); allResults.push({ ...result, leagueId: league.id });
    });
  });
  const playerResult = allResults.find((result) => result.homeId === state.replacedClubId || result.awayId === state.replacedClubId);
  if (playerResult) {
    const home = playerResult.homeId === state.replacedClubId, gf = home ? playerResult.hg : playerResult.ag, ga = home ? playerResult.ag : playerResult.hg;
    state.seasonStats.goals += gf;
    const outcome = gf > ga ? 'win' : gf === ga ? 'draw' : 'loss';
    state.seasonStats[`${outcome}s`] += 1;
    state.seasonStats.streak = outcome === 'win' ? state.seasonStats.streak + 1 : 0;
    state.seasonStats.bestStreak = Math.max(state.seasonStats.bestStreak, state.seasonStats.streak);
    state.cash += (home ? CONFIG.matchIncome.home : CONFIG.matchIncome.away) + (outcome === 'win' ? CONFIG.matchIncome.win : outcome === 'draw' ? CONFIG.matchIncome.draw : 0);
    state.owned.forEach((id) => {
      const player = byId(state, id);
      const current = formValue(player);
      const change = state.lineup.includes(id)
        ? (CONFIG.playerForm[outcome] || 0) + CONFIG.playerForm.starterBonus
        : CONFIG.playerForm.reserveRecovery;
      player.form = Math.max(CONFIG.playerForm.min, Math.min(CONFIG.playerForm.max, current + change));
    });
    updatePlayerForms(outcome);
    checkAchievements(playerResult);
  }
  state.lastLineup = [...state.lineup]; state.fatigue = Math.min(100, state.fatigue + CONFIG.fatiguePerMatch);
  state.familiarity[state.formation] = Math.min(100, state.familiarity[state.formation] + 5);
  state.results = allResults; state.phase = 'RESULT';
  if (state.week >= CONFIG.seasonRounds) finishSeason();
  else { state.week += 1; state.actions = Math.min(CONFIG.maxActions, state.actions + CONFIG.weeklyActions); ageMarket(); refreshMarket(); }
  render();
}
function checkAchievements(result) {
  const unlock = (id, label, reward) => { if (!state.achievements[id]) { state.achievements[id] = true; state.cash += reward; state.rewardLog.unshift(`${label} +${fmt(reward)}`); } };
  unlock('first_match', '完成首场比赛', 1);
  const home = result.homeId === state.replacedClubId, won = (home && result.hg > result.ag) || (!home && result.ag > result.hg);
  if (won) unlock('first_win', '取得首胜', 2);
  if (result.upset && won) unlock('first_upset', '完成爆冷', 3);
  if (state.seasonStats.bestStreak >= 3) unlock('streak_3', '三连胜', 3);
  if (lineupPower() >= 80) unlock('power_80', '阵容实力达到80', 3);
}
function finishSeason() {
  const rank = standings(state.leagueId).findIndex((row) => row.clubId === state.replacedClubId) + 1;
  let sponsorDone = false;
  if (state.sponsor) {
    const value = { wins: state.seasonStats.wins, rank, power: lineupPower(), goals: state.seasonStats.goals, trades: state.seasonStats.trades }[state.sponsor.type];
    sponsorDone = state.sponsor.type === 'rank' ? value <= state.sponsor.target : value >= state.sponsor.target;
    if (sponsorDone) state.cash += state.sponsor.reward;
  }
  const cost = state.owned.reduce((sum, id) => sum + playerValue(byId(state, id)), 0) * CONFIG.operatingRate;
  state.seasonSummary = { rank, sponsorDone, cost, points: standings(state.leagueId).find((row) => row.clubId === state.replacedClubId).pts };
  if (rank === 20) { state.gameOver = true; state.gameOverReason = '联赛垫底'; }
  if (state.cash >= cost) state.cash -= cost; else { state.financialCrisis = cost - state.cash; }
  state.phase = 'SEASON_END'; save();
}

function ageMarket() { state.market.forEach((listing) => { listing.weeks -= 1; }); state.market = state.market.filter((listing) => listing.weeks > 0 && byId(state, listing.playerId)?.ownerType !== 'PLAYER'); }
function canClubSell(player) {
  const club = clubById(state, player.ownerId); if (!club) return false;
  return club.roster.map((id) => byId(state, id)).filter((candidate) => candidate.position === player.position).length > ({ GK: 1, DEF: 4, MID: 3, FWD: 1 }[player.position]);
}
function refreshMarket() {
  const listed = new Set(state.market.map((listing) => listing.playerId));
  const pool = shuffle(state.players.filter((player) => !listed.has(player.id) && (player.ownerType === 'FREE' || (player.ownerType === 'CLUB' && canClubSell(player)))));
  const ratingTargets = [92, 88, 85, 83, 81, 79, 77, 75, 73, 71, 68, 64];
  while (state.market.length < CONFIG.marketSize && pool.length) {
    const slot = state.market.length;
    const target = ratingTargets[(slot + state.week - 1) % ratingTargets.length];
    let bestIndex = 0;
    for (let index = 1; index < pool.length; index += 1) {
      if (Math.abs(pool[index].rating - target) < Math.abs(pool[bestIndex].rating - target)) bestIndex = index;
    }
    const [player] = pool.splice(bestIndex, 1);
    state.market.push({ id: `listing_${state.week}_${player.id}`, playerId: player.id, sellerId: player.ownerId, type: player.ownerType, price: Math.round(playerValue(player) * (.9 + random() * .3) * 10) / 10, weeks: CONFIG.listingWeeks });
  }
}
function spendAction() { if (state.actions < 1) { notify('行动点不足'); return false; } state.actions -= 1; return true; }
function buyPlayer(listingId) {
  const listing = state.market.find((item) => item.id === listingId), player = listing && byId(state, listing.playerId);
  if (!listing || !player || state.cash < listing.price) return notify('资金不足或挂牌已失效');
  if (!spendAction()) return;
  if (player.ownerType === 'CLUB') { const club = clubById(state, player.ownerId); club.roster = club.roster.filter((id) => id !== player.id); club.budget += listing.price; }
  player.ownerType = 'PLAYER'; player.ownerId = state.replacedClubId; state.owned.push(player.id); state.cash -= listing.price; state.market = state.market.filter((item) => item.id !== listingId); state.seasonStats.trades += 1; save(); notify(`已签下 ${player.name}`);
}
function sellPlayer(id, crisis = false) {
  if (state.lineup.includes(id)) return notify('请先将该球员移出首发');
  if (!crisis && !spendAction()) return;
  const player = byId(state, id); const price = salePrice(player);
  state.cash += price; state.owned = state.owned.filter((playerId) => playerId !== id); player.ownerType = 'FREE'; player.ownerId = null; state.seasonStats.trades += 1;
  if (crisis && state.financialCrisis) state.financialCrisis = Math.max(0, state.seasonSummary.cost - state.cash);
  save(); notify(`已出售 ${player.name}，获得 ${fmt(price)}`);
}
function synthesize() {
  const players = synthSelection.map((id) => byId(state, id));
  if (players.length !== 3 || new Set(players.map((p) => p.grade)).size !== 1) return notify('请选择3名同等级球员');
  if (players.some((player) => state.lineup.includes(player.id))) return notify('首发球员不能作为合成素材');
  const keep = players.sort((a, b) => b.rating - a.rating)[0]; const oldGrade = keep.grade; const next = CONFIG.nextGrade[oldGrade];
  if (oldGrade === 'SSS' && keep.rating >= 100) return notify('100分球员不能继续强化');
  if (!spendAction()) return;
  keep.rating = oldGrade === 'SSS' ? 100 : CONFIG.gradeFloor[next]; keep.grade = gradeFromRating(keep.rating); keep.upgradeCount += 1;
  players.slice(1).forEach((player) => { state.owned = state.owned.filter((id) => id !== player.id); player.ownerType = 'FREE'; player.ownerId = null; });
  synthSelection = []; save(); notify(`${keep.name} 已强化至 ${keep.grade} ${keep.rating}`);
}
function toggleLineup(id) {
  if (state.lineup.includes(id)) state.lineup = state.lineup.filter((playerId) => playerId !== id);
  else if (state.lineup.length < 11) state.lineup.push(id);
  else return notify('首发已满，请先移出一名球员');
  render();
}

function playerCard(player, actions = '') {
  return `<article class="card player grade-${player.grade}"><span class="grade">${player.grade}</span><div class="rating">${player.rating}</div><div class="avatar">${esc(chinesePlayerName(player).slice(0, 1))}</div><strong>${esc(chinesePlayerName(player))}</strong><div class="muted">${CONFIG.positionNames[player.position]} · ${esc(player.country)}</div><div class="muted">状态 ${formValue(player)} · ${formLabel(player)}</div><div class="player-foot"><span>身价 ${fmt(playerValue(player))}</span>${actions}</div></article>`;
}
function nav() {
  const links = [['dashboard','总览'],['squad','阵容'],['collection','收藏'],['market','市场'],['synthesis','合成'],['league','联赛'],['finance','财务'],['save','存档']];
  return `<aside class="sidebar"><div class="brand"><span class="brand-mark">PCM</span><div>绿茵卡牌经理<small>2025/26</small></div></div><nav class="nav">${links.map(([id,label]) => `<button data-page="${id}" class="${state.page === id ? 'active' : ''}">${label}</button>`).join('')}</nav><div class="season-track"><span>赛季进度</span><strong>${state.week}/38</strong><div class="progress"><span style="width:${state.week / 38 * 100}%"></span></div></div></aside>`;
}
function shell(content, title) {
  return `<div class="shell">${nav()}<main class="main"><header class="topbar"><div><div class="eyebrow">${esc(leagueById(state.leagueId)?.name || '')} · 第1赛季</div><h1>${title}</h1></div><div class="meta"><span class="pill">第 <strong>${state.week}</strong> 轮</span><span class="pill">行动 <strong>${state.actions}/6</strong></span><span class="pill money">${fmt(state.cash)}</span></div></header>${content}</main></div>${toast ? `<div class="toast">${esc(toast)}</div>` : ''}`;
}
function stat(label, value, note='') { return `<div class="card stat"><span class="muted">${label}</span><div class="stat-value">${value}</div><small>${note}</small></div>`; }

function renderTitle() {
  const slots = [1,2,3].map((slot) => { const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`); let data = null; try { data = raw && JSON.parse(raw); } catch {}
    return `<article class="card save-slot"><div><span class="eyebrow">存档 ${slot}</span><h3>${data ? esc(data.clubName) : '空存档'}</h3><p class="muted">${data ? `${leagueById(data.leagueId)?.name || ''} · 第${data.week}轮 · ${fmt(data.cash)}` : '创建属于你的球队'}</p></div><div class="actions">${data ? `<button class="btn primary" data-load="${slot}">继续</button><button class="btn" data-new="${slot}">重开</button>` : `<button class="btn primary" data-new="${slot}">新游戏</button>`}</div></article>`; }).join('');
  app.innerHTML = `<div class="landing"><section class="landing-copy"><span class="eyebrow">CARD · CLUB · GLORY</span><h1>从二十三张卡开始<br><em>重写绿茵秩序</em></h1><p>管理阵容，掌控转会，在五大联赛同步运转的世界中完成38轮挑战。</p><div class="feature-row"><span>1000名球员</span><span>五大联赛</span><span>本地存档</span></div></section><section class="slot-panel"><h2>选择存档</h2>${slots}</section></div>`;
}
function renderSetup() {
  const league = leagueById(state.leagueId);
  app.innerHTML = `<div class="setup"><div class="setup-head"><span class="eyebrow">建立你的俱乐部</span><h1>一切从新的队徽开始</h1><p class="muted">选择联赛和一个席位。原球队球员将进入自由市场。</p></div><form id="setup-form" class="card grid form-grid"><label class="field"><span>球队名称</span><input name="clubName" value="新星竞技" maxlength="16" required></label><label class="field"><span>球队主色</span><input name="primary" type="color" value="#42e08b"></label><label class="field"><span>参加联赛</span><select name="league" id="league-select">${LEAGUES.map((item) => `<option value="${item.id}" ${item.id === state.leagueId ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label><label class="field"><span>替换球队</span><select name="club" id="club-select">${league.clubs.map((name, index) => `<option value="${league.id}_${index+1}">${name}</option>`).join('')}</select></label><div class="setup-summary"><strong>开局资产</strong><span>${fmt(CONFIG.startingCash)} · 23张球员卡 · 完整首发与轮换阵容</span></div><button class="btn primary wide" type="submit">抽取初始阵容</button></form></div>`;
}
function renderDraft() {
  app.innerHTML = `<div class="draft-page"><header class="draft-head"><div><span class="eyebrow">初始阵容</span><h1>你的二十三人阵容，已经就位</h1><p class="muted">1A + 5B + 5C，覆盖完整4-4-2位置，所有卡牌均为实名球员。</p></div><div class="actions"><button class="btn" id="reroll" ${state.rerolled ? 'disabled' : ''}>整套重抽一次</button><button class="btn primary" id="accept-draft">确认阵容</button></div></header><div class="grid player-grid">${state.owned.map((id) => playerCard(byId(state,id))).join('')}</div></div>`;
}
function renderSponsor() {
  app.innerHTML = `<div class="setup sponsor-page"><div class="setup-head"><span class="eyebrow">赛季合作伙伴</span><h1>选择一份赞助合同</h1><p class="muted">立即获得预付款，达成目标后领取完成奖金。</p></div><div class="grid sponsor-grid">${state.sponsorChoices.map((s) => `<article class="card sponsor"><span class="eyebrow">预付 ${fmt(s.upfront)}</span><h2>${s.title}</h2><p>${s.description}</p><div class="sponsor-reward"><span>完成奖金</span><strong>${fmt(s.reward)}</strong></div><button class="btn primary" data-sponsor="${s.id}">签署合同</button></article>`).join('')}</div></div>`;
}
function dashboard() {
  const table = standings(state.leagueId); const rank = table.findIndex((row) => row.clubId === state.replacedClubId) + 1;
  const fixture = state.schedules[state.leagueId]?.[state.week - 1]?.find((game) => game.home === state.replacedClubId || game.away === state.replacedClubId);
  const opponentId = fixture && (fixture.home === state.replacedClubId ? fixture.away : fixture.home);
  return `<section class="hero card" style="--club:${state.colors[0]}"><span class="eyebrow">下一场 · ${fixture?.home === state.replacedClubId ? '主场' : '客场'}</span><h2>${esc(state.clubName)} <i>vs</i> ${esc(clubById(state,opponentId)?.name || '待定')}</h2><p>有效实力 ${lineupPower().toFixed(1)} · 阵型 ${state.formation} · 熟练度 ${state.familiarity[state.formation]}%</p><button class="btn primary next-round" id="play-round">进入第${state.week}轮</button></section><div class="grid stats">${stat('联赛排名', rank ? `第 ${rank} 名` : '未开赛','目标：避免垫底')}${stat('有效实力',lineupPower().toFixed(1),isLegalLineup()?'阵容合法':'阵容不合法')}${stat('球队疲劳',`${state.fatigue}%`,'轮换可额外恢复')}${stat('收藏球员',state.owned.length,'首发11人')}</div><div class="grid two-col"><section class="card"><div class="section-head"><h2>赛季任务</h2><button class="btn" data-page="league">查看积分榜</button></div><div class="mission"><div><span class="eyebrow">${state.sponsor?.title || '未签约'}</span><h3>${state.sponsor?.description || ''}</h3></div><strong>${state.sponsor ? fmt(state.sponsor.reward) : ''}</strong></div><div class="mission"><div><span class="eyebrow">本季战绩</span><h3>${state.seasonStats.wins}胜 ${state.seasonStats.draws}平 ${state.seasonStats.losses}负</h3></div><strong>${state.seasonStats.goals}球</strong></div></section><section class="card"><h2>近期动态</h2>${state.rewardLog.length ? state.rewardLog.slice(0,5).map((item) => `<p class="notice">${esc(item)}</p>`).join('') : '<div class="empty">首场比赛后将在这里生成动态</div>'}</section></div>`;
}
function squad() {
  return `<div class="section-head"><div><p class="eyebrow">TEAM MANAGEMENT</p><h2>首发阵容</h2></div><div class="actions"><select id="formation">${Object.keys(CONFIG.formations).map((f)=>`<option ${f===state.formation?'selected':''}>${f}</option>`).join('')}</select><button class="btn primary" id="best-lineup">一键最强</button></div></div><div class="grid stats">${stat('基础/有效实力',lineupPower(state.lineup,state.formation,0,0).toFixed(1)+' / '+lineupPower().toFixed(1))}${stat('首发人数',`${state.lineup.length}/11`,isLegalLineup()?'阵容合法':'位置或人数不符')}${stat('阵型熟练度',`${state.familiarity[state.formation]}%`)}${stat('疲劳扣分',(state.fatigue*.05).toFixed(1))}</div><div class="grid player-grid">${state.owned.map((id)=>{const p=byId(state,id);return playerCard(p,`<button class="mini ${state.lineup.includes(id)?'active':''}" data-lineup="${id}">${state.lineup.includes(id)?'移出首发':'加入首发'}</button>`)}).join('')}</div>`;
}
function collection() { return `<div class="section-head"><div><p class="eyebrow">${state.owned.length} PLAYERS</p><h2>球员收藏</h2></div></div><p class="notice">出售报价随状态浮动：状态40时约为身价80%，状态70时等于身价，状态100时可达身价120%。</p><div class="grid player-grid">${state.owned.map((id)=>{const p=byId(state,id);return playerCard(p,`<button class="mini danger-text" data-sell="${id}" ${state.lineup.includes(id)?'disabled':''}>出售 ${fmt(salePrice(p))}</button>`)}).join('')}</div>`; }
function market() { return `<div class="section-head"><div><p class="eyebrow">每次购买消耗1行动点</p><h2>转会市场</h2></div><button class="btn" id="market-info">挂牌保留2周</button></div><div class="grid player-grid">${state.market.map((listing)=>{const p=byId(state,listing.playerId);return playerCard(p,`<span class="listing-type">${listing.type==='FREE'?'自由球员':'俱乐部挂牌'} · ${listing.weeks}周</span><button class="mini buy" data-buy="${listing.id}" ${state.cash<listing.price?'disabled':''}>签下 ${fmt(listing.price)}</button>`)}).join('')}</div>`; }
function synthesis() {
  return `<div class="section-head"><div><p class="eyebrow">3张同等级 → 强化1张</p><h2>合成中心</h2></div><button class="btn gold" id="synthesize" ${synthSelection.length!==3?'disabled':''}>确认合成 (${synthSelection.length}/3)</button></div><p class="notice">系统保留所选球员中评分最高者，其余两人回到无主池。首发球员不可作为素材。</p><div class="grid player-grid">${state.owned.filter((id)=>!state.lineup.includes(id)).map((id)=>{const p=byId(state,id);return playerCard(p,`<button class="mini ${synthSelection.includes(id)?'active':''}" data-synth="${id}">${synthSelection.includes(id)?'已选择':'选择素材'}</button>`)}).join('')}</div>`;
}
function league() {
  const viewedLeague = state.viewLeagueId || state.leagueId; const table=standings(viewedLeague); const scores=state.results.filter((r)=>r.leagueId===viewedLeague);
  return `<div class="tabs">${LEAGUES.map((l)=>`<button class="btn ${l.id===viewedLeague?'primary':''}" data-league-tab="${l.id}">${l.name}</button>`).join('')}</div><div class="grid two-col"><section class="card table-wrap"><h2>${leagueById(viewedLeague).name}积分榜</h2><table><thead><tr><th>#</th><th>球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>净胜</th><th>分</th></tr></thead><tbody>${table.map((r,i)=>`<tr class="${r.clubId===state.replacedClubId?'player-row':''}"><td>${i+1}</td><td>${esc(r.name)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd}</td><td class="score">${r.pts}</td></tr>`).join('')}</tbody></table></section><section class="card"><h2>最近一轮比分</h2>${scores.length?scores.map((r)=>`<div class="result-row"><span>${esc(r.homeName)}</span><strong>${r.hg} : ${r.ag}</strong><span>${esc(r.awayName)}</span></div>`).join(''):'<div class="empty">尚未进行比赛</div>'}</section></div>`;
}
function finance() { const squadValue=state.owned.reduce((sum,id)=>sum+playerValue(byId(state,id)),0); const liquidationValue=state.owned.reduce((sum,id)=>sum+salePrice(byId(state,id)),0); return `<div class="grid stats">${stat('可用资金',fmt(state.cash))}${stat('球员总身价',fmt(squadValue))}${stat('状态出售总价',fmt(liquidationValue))}${stat('即时净资产',fmt(state.cash+liquidationValue))}${stat('预计运营成本',fmt(squadValue*CONFIG.operatingRate),'赛季末收取5%')}</div><section class="card"><h2>经济规则</h2><div class="rule-list"><p><strong>比赛收入</strong><span>主场1.2M / 客场0.6M，胜平另有奖金</span></p><p><strong>即时出售</strong><span>根据球员状态按基础身价的80%至120%成交，每笔消耗1行动点</span></p><p><strong>球员状态</strong><span>首发球员随胜平负变化，替补逐步恢复到中性状态</span></p><p><strong>行动点</strong><span>每周增加3点，最多累计6点</span></p></div></section>`; }
function savePage() { return `<section class="card save-center"><span class="eyebrow">当前存档 ${state.slot}</span><h2>${esc(state.clubName)}</h2><p class="muted">第1赛季 · 第${state.week}轮 · 随机种子状态 ${state.rngState}</p><div class="actions"><button class="btn primary" id="manual-save">手动保存</button><button class="btn" id="back-title">返回标题</button></div><p class="notice">买入、出售和合成后会自动保存；比赛结算后请手动保存。</p></section>`; }
function seasonEnd() {
  const s=state.seasonSummary;
  return `<div class="season-end"><section class="card season-hero"><span class="eyebrow">2025/26 赛季总结</span><h1>第 ${s.rank} 名</h1><p>${s.points}积分 · ${state.seasonStats.wins}胜 ${state.seasonStats.draws}平 ${state.seasonStats.losses}负</p></section><div class="grid stats">${stat('赞助目标',s.sponsorDone?'已完成':'未完成')}${stat('运营成本',fmt(s.cost))}${stat('结算后资金',fmt(state.cash))}${stat('赛季状态',state.gameOver?state.gameOverReason:state.financialCrisis?'财务危机':'纵向切片完成')}</div>${state.financialCrisis?`<section class="card"><h2>财务危机：还差 ${fmt(state.financialCrisis)}</h2><p class="muted">出售非首发球员以支付运营成本。此阶段不消耗行动点。</p><div class="grid player-grid">${state.owned.filter(id=>!state.lineup.includes(id)).map(id=>{const p=byId(state,id);return playerCard(p,`<button class="mini danger-text" data-crisis-sell="${id}">出售 ${fmt(salePrice(p))}</button>`)}).join('')}</div></section>`:`<section class="card end-message"><h2>${state.gameOver?'挑战结束':'首赛季纵向切片已完成'}</h2><p class="muted">完整四赛季模式将在下一开发阶段开放。你可以保存本次结果或开始新挑战。</p><div class="actions"><button class="btn primary" id="manual-save">保存结果</button><button class="btn" id="back-title">返回标题</button></div></section>`}</div>`;
}
function renderGame() {
  if (state.phase === 'SEASON_END') { app.innerHTML = shell(seasonEnd(),'赛季结算'); bind(); return; }
  const pages={dashboard,squad,collection,market,synthesis,league,finance,save:savePage};
  const titles={dashboard:'俱乐部总览',squad:'阵容管理',collection:'球员收藏',market:'转会市场',synthesis:'合成中心',league:'联赛中心',finance:'财务中心',save:'存档管理'};
  app.innerHTML=shell((pages[state.page]||dashboard)(),titles[state.page]||titles.dashboard); bind();
}
function render() {
  if (!state) renderTitle(); else if (state.phase === 'SETUP') renderSetup(); else if (state.phase === 'DRAFT') renderDraft(); else if (state.phase === 'SPONSOR') renderSponsor(); else renderGame();
  bind();
}

function bind() {
  document.querySelectorAll('[data-new]').forEach((el)=>el.onclick=()=>{ const slot=Number(el.dataset.new); if(localStorage.getItem(`${SAVE_PREFIX}${slot}`)&&!confirm('覆盖此存档并开始新游戏？'))return; startSetup(slot); });
  document.querySelectorAll('[data-load]').forEach((el)=>el.onclick=()=>load(Number(el.dataset.load)));
  document.querySelectorAll('[data-page]').forEach((el)=>el.onclick=()=>{state.page=el.dataset.page;render();});
  const leagueSelect=document.querySelector('#league-select'); if(leagueSelect) leagueSelect.onchange=()=>{state.leagueId=leagueSelect.value;renderSetup();};
  const setup=document.querySelector('#setup-form'); if(setup) setup.onsubmit=(event)=>{event.preventDefault();finalizeSetup(setup);};
  document.querySelector('#reroll')?.addEventListener('click',rerollDraft);
  document.querySelector('#accept-draft')?.addEventListener('click',acceptDraft);
  document.querySelectorAll('[data-sponsor]').forEach((el)=>el.onclick=()=>chooseSponsor(el.dataset.sponsor));
  document.querySelector('#play-round')?.addEventListener('click',()=>{if(confirm(`确认进入第${state.week}轮？`))playRound();});
  document.querySelector('#formation')?.addEventListener('change',(event)=>{state.formation=event.target.value;state.lineup=bestLineup();render();});
  document.querySelector('#best-lineup')?.addEventListener('click',()=>{state.lineup=bestLineup();render();});
  document.querySelectorAll('[data-lineup]').forEach((el)=>el.onclick=()=>toggleLineup(el.dataset.lineup));
  document.querySelectorAll('[data-buy]').forEach((el)=>el.onclick=()=>buyPlayer(el.dataset.buy));
  document.querySelectorAll('[data-sell]').forEach((el)=>el.onclick=()=>{if(confirm('确认即时出售这名球员？'))sellPlayer(el.dataset.sell);});
  document.querySelectorAll('[data-crisis-sell]').forEach((el)=>el.onclick=()=>sellPlayer(el.dataset.crisisSell,true));
  document.querySelectorAll('[data-synth]').forEach((el)=>el.onclick=()=>{const id=el.dataset.synth;synthSelection=synthSelection.includes(id)?synthSelection.filter(x=>x!==id):synthSelection.length<3?[...synthSelection,id]:synthSelection;render();});
  document.querySelector('#synthesize')?.addEventListener('click',synthesize);
  document.querySelectorAll('[data-league-tab]').forEach((el)=>el.onclick=()=>{state.viewLeagueId=el.dataset.leagueTab;render();});
  document.querySelector('#manual-save')?.addEventListener('click',()=>save(true));
  document.querySelector('#back-title')?.addEventListener('click',()=>{state=null;render();});
}

render();
