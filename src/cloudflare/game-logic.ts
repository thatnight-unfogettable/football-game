import { RULES } from '../../game.js';

const PROTOCOL = 1;

export function roomCode() {
  let code: string;
  do {
    code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  } while (false); // 在 Durable Object 中由存储管理
  return code;
}

export function token(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function validName(name: string): boolean {
  return typeof name === 'string' && /^[\u4e00-\u9fa5A-Za-z0-9_]{2,16}$/.test(name);
}

export function sanitize(room: any, viewer: string) {
  const game = room.game;
  return {
    code: room.code,
    status: room.status,
    players: Object.fromEntries(
      Object.entries(room.players).map(([side, p]: [string, any]) => [
        side,
        p && { nickname: p.nickname, ready: p.ready, connected: !!p.webSocketId, side }
      ])
    ),
    you: viewer,
    choiceOwner: room.choiceOwner,
    deadline: room.deadline,
    chat: room.chat.slice(-8),
    rematch: room.rematch,
    game: game && {
      version: game.version,
      seed: room.status === 'finished' ? game.seed : null,
      settings: game.settings,
      phase: game.phase,
      round: game.round,
      firstBanner: game.firstBanner,
      banTurn: game.banTurn,
      banCount: game.banCount,
      pickTurn: game.pickTurn,
      candidates: game.phase === 'ORDER' ? [] : game.candidates,
      bans: game.bans,
      picks: game.picks,
      layouts: game.layouts,
      matches: game.matches,
      winner: game.winner,
      logs: game.logs
    }
  };
}

export function playerSideToEngine(side: string) {
  return side === 'A' ? 'player' : 'ai';
}

export function engineSideToPlayer(side: string) {
  return side === 'player' ? 'A' : 'B';
}

export function createGame(settings: any = {}) {
  const seed = Number(settings.seed) || Date.now() % 2147483647;
  const players = preparePlayers();
  const candidateRounds = generateCandidateRounds(players, seed);
  return {
    version: RULES.version,
    seed,
    rngState: seed,
    settings: { difficulty: 'normal', personality: 'power', speed: 'normal', timer: false, ...settings },
    phase: 'ORDER',
    round: 0,
    firstBanner: null,
    candidates: candidateRounds[0],
    candidateRounds,
    bans: [],
    picks: { player: [RULES.courtois], ai: [RULES.courtois] },
    banTurn: null,
    banCount: 0,
    selectedId: null,
    logs: [],
    layouts: { player: null, ai: null },
    matches: [],
    winner: null,
    createdAt: new Date().toISOString()
  };
}

export function startRound(game: any, playerOrder: string) {
  const first = playerOrder === 'first' ? 'player' : 'ai';
  return { ...game, phase: 'BAN', firstBanner: first, banTurn: first, banCount: 0, bans: [], selectedId: null };
}

export function available(game: any) {
  const used = new Set([
    ...game.bans.map((b: any) => b.playerId),
    ...game.picks.player.map((p: any) => p.id),
    ...game.picks.ai.map((p: any) => p.id)
  ]);
  return game.candidates.filter((p: any) => !used.has(p.id));
}

export function banPlayer(game: any, actor: string, playerId: string, reason = '') {
  if (game.phase !== 'BAN' || game.banTurn !== actor || !available(game).some((p: any) => p.id === playerId)) return game;
  const bans = [...game.bans, { actor, playerId, order: game.banCount + 1, reason }];
  const count = game.banCount + 1;
  return {
    ...game,
    bans,
    banCount: count,
    banTurn: count >= 6 ? null : (actor === 'player' ? 'ai' : 'player'),
    phase: count >= 6 ? 'PICK' : 'BAN',
    pickTurn: count >= 6 ? actor : null,
    selectedId: null,
    logs: [...game.logs, { type: 'BAN', round: game.round, actor, playerId, reason }]
  };
}

export function pickPlayer(game: any, actor: string, playerId: string) {
  if (game.phase !== 'PICK' || game.pickTurn !== actor || !available(game).some((p: any) => p.id === playerId)) return game;
  const picks = { player: [...game.picks.player], ai: [...game.picks.ai] };
  picks[actor].push(game.candidates.find((p: any) => p.id === playerId));
  const next = actor === 'player' ? 'ai' : 'player';
  const bothPicked = picks.player.length === game.round + 2 && picks.ai.length === game.round + 2;
  return {
    ...game,
    picks,
    selectedId: null,
    pickTurn: bothPicked ? null : next,
    phase: bothPicked ? 'ROUND_END' : 'PICK',
    logs: [...game.logs, { type: 'PICK', round: game.round, actor, playerId }]
  };
}

export function nextRound(game: any) {
  const next = game.round + 1;
  if (next >= RULES.rounds.length) return finalizeDraft(game);
  return {
    ...game,
    round: next,
    candidates: game.candidateRounds[next],
    phase: 'ORDER',
    bans: [],
    banCount: 0,
    banTurn: null,
    pickTurn: null,
    selectedId: null
  };
}

export function swapSlots(game: any, side: string, a: string, b: string) {
  const layout = { ...game.layouts[side] };
  [layout[a], layout[b]] = [layout[b], layout[a]];
  return { ...game, layouts: { ...game.layouts, [side]: layout } };
}

export function finalizeDraft(game: any) {
  const layouts = { player: optimizeLayout(game.picks.player), ai: optimizeLayout(game.picks.ai) };
  return { ...game, phase: 'LINEUP', layouts };
}

export function optimizeLayout(roster: any[]) {
  const groups = { FWD: roster.filter(p => p.position === 'FWD'), MID: roster.filter(p => p.position === 'MID'), DEF: roster.filter(p => p.position === 'DEF') };
  return {
    ...permutationsAssign(groups.FWD, ['LW', 'ST', 'RW']),
    ...permutationsAssign(groups.MID, ['CM1', 'CDM', 'CM2']),
    ...permutationsAssign(groups.DEF, ['LB', 'CB1', 'CB2', 'RB']),
    GK: RULES.courtois
  };
}

function permutationsAssign(players: any[], slots: string[]) {
  const remaining = [...players];
  const assigned: any = {};
  slots.forEach(slot => {
    let best = 0;
    let bestScore = -1;
    remaining.forEach((p, i) => {
      const score = p.rating * fit(p, slot);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    assigned[slot] = remaining.splice(best, 1)[0];
  });
  return assigned;
}

function fit(player: any, slot: string) {
  if (slot === 'GK') return player.id === 'shared_courtois' ? 1 : player.detailedPosition === 'GK' ? 1 : 0.92;
  const positions = [player.detailedPosition, ...(player.alternativePositions || [])];
  const slotAccept: Record<string, string[]> = {
    LW: ['LW', 'LM', 'ST', 'RW'], ST: ['ST', 'CF', 'LW', 'RW'], RW: ['RW', 'RM', 'ST', 'LW'],
    CM1: ['CM', 'CAM', 'CDM', 'LM', 'RM'], CM2: ['CM', 'CAM', 'CDM', 'LM', 'RM'],
    CDM: ['CDM', 'CM', 'CB', 'CAM'], LB: ['LB', 'LWB', 'CB'], RB: ['RB', 'RWB', 'CB'],
    CB1: ['CB', 'LB', 'RB', 'CDM'], CB2: ['CB', 'LB', 'RB', 'CDM'], GK: ['GK']
  };
  const index = slotAccept[slot]?.findIndex(p => positions.includes(p)) ?? -1;
  return index === 0 ? 1 : index > 0 ? 0.96 : 0.92;
}

export function evaluateRoster(roster: any[], layout: any) {
  const lineSlots: Record<string, string[]> = { GK: ['GK'], DEF: ['LB', 'CB1', 'CB2', 'RB'], MID: ['CM1', 'CDM', 'CM2'], FWD: ['LW', 'ST', 'RW'] };
  const weights: Record<string, number> = { GK: 0.1, DEF: 0.3, MID: 0.3, FWD: 0.3 };
  let paper = 0;
  const lines: any = {};
  Object.entries(lineSlots).forEach(([line, slots]) => {
    lines[line] = slots.reduce((s, slot) => s + (layout[slot]?.rating || 60) * fit(layout[slot] || {}, slot), 0) / slots.length;
    paper += lines[line] * weights[line];
  });
  const outfield = Object.values(layout).filter((p: any) => p && p.id !== 'shared_courtois');
  const slotFit = Object.entries(layout).reduce((s, [slot, p]) => s + (slot === 'GK' ? 0 : fit(p as any, slot as string)), 0) / 10 * 32;
  const template = (['LW', 'ST', 'RW'].every(s => fit(layout[s], s) >= 0.96) ? 3 : 0) +
    (['CM1', 'CDM', 'CM2'].every(s => fit(layout[s], s) >= 0.96) ? 2 : 0) +
    (['LB', 'CB1', 'CB2', 'RB'].every(s => fit(layout[s], s) >= 0.96) ? 3 : 0);
  const role = Math.min(40, slotFit + template);
  const club = groupComponent(outfield, 'club', [[2, 4], [3, 8], [4, 12]], 20);
  const league = groupComponent(outfield, 'league', [[2, 3], [4, 7], [6, 11]], 15);
  const nation = groupComponent(outfield, 'country', [[2, 3], [3, 6], [5, 10]], 15);
  const high = outfield.filter(p => p.rating >= 85).length;
  const leader = Math.min(6, high * 2);
  const ratings = outfield.map(p => p.rating);
  const gap = Math.max(...ratings) - Math.min(...ratings);
  const balance = gap <= 8 ? 4 : gap <= 12 ? 3 : gap <= 16 ? 2 : gap <= 20 ? 1 : 0;
  const grade = leader + balance;
  const chemistry = Math.min(100, role + club + league + nation + grade);
  return { paper, chemistry, overall: paper * 0.7 + chemistry * 0.3, lines, components: { role, club, league, nation, grade }, layout };
}

function groupComponent(players: any[], key: string, steps: number[][], cap: number) {
  const groups: Record<string, number> = {};
  players.forEach((p: any) => {
    const value = p[key];
    if (value) groups[value] = (groups[value] || 0) + 1;
  });
  let score = 0;
  steps.forEach(([n, v]) => { if (Object.values(groups).some((c: number) => c >= n)) score = v; });
  return Math.min(cap, score);
}

export function simulateSeries(game: any) {
  const seed = game.seed ^ 0x9e3779b9;
  const rng = createRng(seed);
  const pe = evaluateRoster(game.picks.player, game.layouts.player);
  const ae = evaluateRoster(game.picks.ai, game.layouts.ai);
  const matches: any[] = [];
  let pw = 0, aw = 0;
  for (let i = 0; i < 3 && pw < 2 && aw < 2; i++) {
    const home = i === 0 ? 1 : i === 1 ? -1 : 0;
    const pVol = (rng.next() * 4 - 2) * (1 - pe.chemistry / 180);
    const aVol = (rng.next() * 4 - 2) * (1 - ae.chemistry / 180);
    const ps = pe.overall + pVol + home;
    const as = ae.overall + aVol - home;
    let pg = poisson(Math.max(0.25, 1.35 * Math.exp((ps - as) / 16)), rng);
    let ag = poisson(Math.max(0.25, 1.35 * Math.exp((as - ps) / 16)), rng);
    if (pg === ag) {
      if (Math.abs(pe.overall - ae.overall) <= 0.5) {
        if (pe.chemistry > ae.chemistry) pg++;
        else if (ae.chemistry > pe.chemistry) ag++;
      } else if (ps > as) pg++;
      else ag++;
    }
    if (pg > ag) pw++;
    else aw++;
    matches.push({ index: i + 1, playerGoals: pg, aiGoals: ag, venue: i === 0 ? '玩家主场' : i === 1 ? 'AI主场' : '中立场' });
  }
  const winner = pw > aw ? 'player' : 'ai';
  const winning = winner === 'player' ? game.picks.player : game.picks.ai;
  const mvp = [...winning].filter(p => p.id !== 'shared_courtois').sort((a, b) => b.rating - a.rating)[0];
  return { ...game, phase: 'RESULT', matches, winner, evaluations: { player: pe, ai: ae }, mvp, finishedAt: new Date().toISOString() };
}

function poisson(lambda: number, rng: ReturnType<typeof createRng>) {
  let p = 1, k = 0;
  const limit = Math.exp(-lambda);
  do { k++; p *= rng.next(); } while (p > limit && k < 12);
  return k - 1;
}

export function createRng(seed: number) {
  let value = (Number(seed) || 1) >>> 0;
  return {
    next() {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    },
    get state() { return value >>> 0; }
  };
}

const CN_NAMES: Record<string, string> = {
  'Kylian Mbappé': '基利安·姆巴佩', 'Rodri': '罗德里', 'Erling Haaland': '埃尔林·哈兰德',
  'Jude Bellingham': '裘德·贝林厄姆', 'Vinícius Júnior': '维尼修斯·儒尼奥尔',
  'Kevin De Bruyne': '凯文·德布劳内', 'Harry Kane': '哈里·凯恩', 'Mohamed Salah': '穆罕默德·萨拉赫',
  'Lautaro Martínez': '劳塔罗·马丁内斯', 'Robert Lewandowski': '罗伯特·莱万多夫斯基',
  'Thibaut Courtois': '蒂博·库尔图瓦', 'Virgil van Dijk': '维吉尔·范戴克',
  'Alisson': '阿利松', 'Ederson': '埃德森', 'Rúben Dias': '鲁本·迪亚斯',
  'Antonio Rüdiger': '安东尼奥·吕迪格', 'William Saliba': '威廉·萨利巴',
  'Federico Valverde': '费德里科·巴尔韦德', 'Martin Ødegaard': '马丁·厄德高',
  'Bruno Fernandes': '布鲁诺·费尔南德斯', 'Bernardo Silva': '贝尔纳多·席尔瓦',
  'Bukayo Saka': '布卡约·萨卡', 'Phil Foden': '菲尔·福登', 'Jamal Musiala': '贾马尔·穆西亚拉',
  'Florian Wirtz': '弗洛里安·维尔茨', 'Pedri': '佩德里', 'Gavi': '加维',
  'Rodrygo': '罗德里戈', 'Antoine Griezmann': '安托万·格列兹曼',
  'Victor Osimhen': '维克托·奥斯梅恩', 'Khvicha Kvaratskhelia': '赫维恰·克瓦拉茨赫利亚',
  'Son Heung Min': '孙兴慜', 'Cristiano Ronaldo': '克里斯蒂亚诺·罗纳尔多',
  'Lionel Messi': '利昂内尔·梅西', 'Neymar Jr': '内马尔', 'Declan Rice': '德克兰·赖斯',
  'Joshua Kimmich': '约书亚·基米希', 'João Cancelo': '若昂·坎塞洛',
  'Achraf Hakimi': '阿什拉夫·哈基米', 'Theo Hernández': '特奥·埃尔南德斯',
  'Mike Maignan': '迈克·迈尼昂', 'Gianluigi Donnarumma': '詹路易吉·多纳鲁马',
  'Marc-André ter Stegen': '马克-安德烈·特尔施特根', 'Cole Palmer': '科尔·帕尔默',
  'Ousmane Dembélé': '奥斯曼·登贝莱', 'Raphinha': '拉菲尼亚', 'Lamine Yamal': '拉明·亚马尔',
  'Alexander Isak': '亚历山大·伊萨克', 'Julián Álvarez': '胡利安·阿尔瓦雷斯',
  'Nico Williams': '尼科·威廉斯', 'Désiré Doué': '德西雷·杜埃', 'Michael Olise': '迈克尔·奥利塞',
  'Joško Gvardiol': '约什科·格瓦迪奥尔', 'Alessandro Bastoni': '亚历山德罗·巴斯托尼',
  'Marquinhos': '马尔基尼奥斯', 'Gabriel': '加布里埃尔',
  'Trent Alexander-Arnold': '特伦特·亚历山大·阿诺德', 'Andrew Robertson': '安德鲁·罗伯逊',
  'Nuno Mendes': '努诺·门德斯', 'Dani Carvajal': '达尼·卡瓦哈尔',
  'Alejandro Grimaldo': '亚历杭德罗·格里马尔多', 'Nicolò Barella': '尼科洛·巴雷拉',
  'Frenkie de Jong': '弗兰基·德容', 'Alexis Mac Allister': '亚历克西斯·麦卡利斯特',
  'Vitinho': '维蒂尼亚', 'Hakan Çalhanoğlu': '哈坎·恰尔汗奥卢',
  'Aurélien Tchouaméni': '奥雷利安·楚阿梅尼', 'Eduardo Camavinga': '爱德华多·卡马文加'
};

// 简化的球员数据，用于 Cloudflare Workers
const EMBEDDED_PLAYER_DATA = [
  { id: 'mbappe', englishName: 'Kylian Mbappé', name: '姆巴佩', position: 'FWD', rating: 91, country: '法国', league: '法甲', club: '皇家马德里', detailedPosition: 'FWD', grade: 'S' },
  { id: 'haaland', englishName: 'Erling Haaland', name: '哈兰德', position: 'FWD', rating: 91, country: '挪威', league: '英超', club: '曼城', detailedPosition: 'FWD', grade: 'S' },
  { id: 'mbappe', englishName: 'Vinícius Júnior', name: '维尼修斯', position: 'FWD', rating: 90, country: '巴西', league: '西甲', club: '皇家马德里', detailedPosition: 'FWD', grade: 'S' },
  { id: 'bellingham', englishName: 'Jude Bellingham', name: '贝林厄姆', position: 'MID', rating: 90, country: '英格兰', league: '西甲', club: '皇家马德里', detailedPosition: 'CAM', grade: 'S' },
  { id: 'rodri', englishName: 'Rodri', name: '罗德里', position: 'MID', rating: 90, country: '西班牙', league: '英超', club: '曼城', detailedPosition: 'CDM', grade: 'S' },
  { id: 'debruyne', englishName: 'Kevin De Bruyne', name: '德布劳内', position: 'MID', rating: 90, country: '比利时', league: '英超', club: '曼城', detailedPosition: 'CAM', grade: 'S' },
  { id: 'vandijk', englishName: 'Virgil van Dijk', name: '范戴克', position: 'DEF', rating: 90, country: '荷兰', league: '英超', club: '利物浦', detailedPosition: 'CB', grade: 'S' },
  { id: 'courtois', englishName: 'Thibaut Courtois', name: '库尔图瓦', position: 'GK', rating: 90, country: '比利时', league: '西甲', club: '皇家马德里', detailedPosition: 'GK', grade: 'S' },
];

export function preparePlayers() {
  return EMBEDDED_PLAYER_DATA.map((p: any) => ({ 
    ...p, 
    nameZh: CN_NAMES[p.englishName] || p.name, 
    alternativePositions: [] 
  }));
}

function tierChunk(pool: any[], need: number, rng: ReturnType<typeof createRng>) {
  const selected = [...pool].sort((a, b) => b.rating - a.rating).slice(0, need);
  const tierSize = Math.ceil(selected.length / 4);
  const tiers = [0, 1, 2, 3].map(i => shuffle(selected.slice(i * tierSize, (i + 1) * tierSize), rng));
  const rounds: any[] = [];
  while (rounds.flat().length < need) {
    const round: any[] = [];
    tiers.forEach(tier => round.push(...tier.splice(0, Math.min(3, tier.length))));
    rounds.push(shuffle(round, rng));
  }
  return rounds;
}

function shuffle(list: any[], rng: ReturnType<typeof createRng>) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateCandidateRounds(players: any[], seed: number) {
  const rng = createRng(seed);
  const groups: Record<string, any[]> = { FWD: [], MID: [], DEF: [] };
  Object.keys(groups).forEach(category => {
    groups[category] = tierChunk(players.filter(p => p.position === category), RULES.categoryNeeds[category], rng);
  });
  const indexes = { FWD: 0, MID: 0, DEF: 0 };
  return RULES.rounds.map(rule => groups[rule.category][indexes[rule.category]++]);
}
