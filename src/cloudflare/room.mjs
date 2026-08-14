import { RULES } from '../../game.js';

const PROTOCOL = 1;
const rooms = new Map();
const rate = new Map();

export function roomCode() {
  let code;
  do {
    code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  } while (rooms.has(code));
  return code;
}

export function token() {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/[+/=]/g, c => c === '+' ? '-' : c === '/' ? '_' : '');
}

export function validName(name) {
  return typeof name === 'string' && /^[\p{Script=Han}A-Za-z0-9_]{2,16}$/u.test(name);
}

export function limited(key, limit = 20, windowMs = 5000) {
  const now = Date.now();
  const row = rate.get(key) || [];
  const fresh = row.filter(t => now - t < windowMs);
  fresh.push(now);
  rate.set(key, fresh);
  return fresh.length > limit;
}

export function sanitize(room, viewer) {
  const game = room.game;
  return {
    code: room.code,
    status: room.status,
    players: Object.fromEntries(
      Object.entries(room.players).map(([side, p]) => [
        side,
        p && { nickname: p.nickname, ready: p.ready, connected: !!p.webSocket, side }
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

export function broadcast(room) {
  for (const side of ['A', 'B']) {
    const p = room.players[side];
    if (p?.webSocket) {
      send(p.webSocket, 'STATE', sanitize(room, side));
    }
  }
}

export function send(ws, type, payload = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload, protocol: PROTOCOL }));
  }
}

export function playerSideToEngine(side) {
  return side === 'A' ? 'player' : 'ai';
}

export function engineSideToPlayer(side) {
  return side === 'player' ? 'A' : 'B';
}

export function setDeadline(room, seconds) {
  if (room.timer) clearTimeout(room.timer);
  room.deadline = Date.now() + seconds * 1000;
  room.timer = setTimeout(() => timeoutAction(room), seconds * 1000);
  broadcast(room);
}

export function applyEngineSide(game, side) {
  return playerSideToEngine(side);
}

export function chooseBest(game, side, action) {
  const engine = applyEngineSide(game, side);
  const ids = available(game);
  if (action === 'pick') {
    return [...ids].sort((a, b) => {
      const pa = game.players.find(p => p.id === a);
      const pb = game.players.find(p => p.id === b);
      return pb.rating - pa.rating;
    })[0];
  }
  return [...ids].sort((a, b) => {
    const pa = game.players.find(p => p.id === a);
    const pb = game.players.find(p => p.id === b);
    return pb.rating - pa.rating;
  })[0];
}

export function available(game) {
  const used = new Set([
    ...game.bans.map(b => b.playerId),
    ...game.picks.player.map(p => p.id),
    ...game.picks.ai.map(p => p.id)
  ]);
  return game.candidates.filter(p => !used.has(p.id));
}

export function timeoutAction(room) {
  if (room.status !== 'playing') return;
  const g = room.game;
  if (g.phase === 'ORDER') {
    handleOrder(room, room.choiceOwner, 'last', true);
    return;
  }
  if (g.phase === 'BAN') {
    const actor = engineSideToPlayer(g.banTurn);
    const id = chooseBest(g, actor, 'ban');
    handleAction(room, actor, 'BAN', id, true);
    return;
  }
  if (g.phase === 'PICK') {
    const actor = engineSideToPlayer(g.pickTurn);
    const id = chooseBest(g, actor, 'pick');
    handleAction(room, actor, 'PICK', id, true);
    return;
  }
  if (g.phase === 'LINEUP') {
    for (const side of ['A', 'B']) room.players[side].lineupReady = true;
    finishLineupIfReady(room);
  }
}

export function handleOrder(room, side, choice, auto = false) {
  if (room.game.phase !== 'ORDER' || room.choiceOwner !== side) return false;
  const engineSide = playerSideToEngine(side);
  const first = choice === 'first' ? engineSide : (engineSide === 'player' ? 'ai' : 'player');
  room.game = startRound(room.game, first === 'player' ? 'first' : 'last');
  room.history.push({ type: 'ORDER', side, choice, auto, at: Date.now() });
  setDeadline(room, 30);
  return true;
}

export function handleAction(room, side, type, id, auto = false) {
  const g = room.game;
  const engineSide = playerSideToEngine(side);
  if (type === 'BAN') {
    if (g.phase !== 'BAN' || g.banTurn !== engineSide) return false;
    room.game = banPlayer(g, engineSide, id, auto ? '超时自动' : '在线玩家');
  } else {
    if (g.phase !== 'PICK' || g.pickTurn !== engineSide) return false;
    room.game = pickPlayer(g, engineSide, id);
  }
  room.history.push({ type, side, id, auto, round: g.round, at: Date.now() });
  if (room.game.phase === 'ROUND_END') {
    if (room.timer) clearTimeout(room.timer);
    room.deadline = null;
  } else {
    setDeadline(room, 30);
  }
  return true;
}

export function advance(room, side) {
  if (room.game.phase !== 'ROUND_END') return false;
  room.players[side].continueReady = true;
  if (room.players.A.continueReady && room.players.B.continueReady) {
    room.players.A.continueReady = false;
    room.players.B.continueReady = false;
    room.game = nextRound(room.game);
    if (room.game.phase === 'LINEUP') {
      room.players.A.lineupReady = false;
      room.players.B.lineupReady = false;
      setDeadline(room, 60);
    } else {
      room.choiceOwner = room.choiceOwner === 'A' ? 'B' : 'A';
      setDeadline(room, 15);
    }
  }
  return true;
}

export function lineupSwap(room, side, a, b) {
  if (room.game.phase !== 'LINEUP' || a === 'GK' || b === 'GK') return false;
  const engine = playerSideToEngine(side);
  room.game = swapSlots(room.game, engine, a, b);
  return true;
}

export function finishLineupIfReady(room) {
  if (!room.players.A.lineupReady || !room.players.B.lineupReady) return;
  if (room.timer) clearTimeout(room.timer);
  room.game = simulateSeries(room.game);
  room.status = 'finished';
  room.deadline = null;
  room.finishedAt = Date.now();
  room.history.push({ type: 'RESULT', winner: engineSideToPlayer(room.game.winner), at: Date.now() });
  broadcast(room);
  console.log(`[game] room ${room.code} finished`);
}

export function finishByForfeit(room, loser, reason) {
  if (room.status === 'finished') return;
  if (room.timer) clearTimeout(room.timer);
  room.status = 'finished';
  room.finishedAt = Date.now();
  room.forfeit = { loser, winner: loser === 'A' ? 'B' : 'A', reason };
  room.history.push({ type: 'FORFEIT', ...room.forfeit, at: Date.now() });
  broadcast(room);
}

export function createRoom(ws, nickname) {
  const code = roomCode();
  const side = 'A';
  const session = token();
  const room = {
    code,
    status: 'lobby',
    createdAt: Date.now(),
    players: {
      A: { nickname, ready: false, webSocket: ws, session, continueReady: false, lineupReady: false },
      B: null
    },
    game: null,
    choiceOwner: null,
    deadline: null,
    timer: null,
    chat: [],
    rematch: { A: false, B: false },
    history: []
  };
  rooms.set(code, room);
  ws.room = code;
  ws.side = side;
  send(ws, 'SESSION', { code, side, token: session });
  broadcast(room);
  console.log(`[room] created ${code}`);
}

export function joinRoom(ws, code, nickname) {
  const room = rooms.get(code);
  if (!room) return send(ws, 'ERROR', { message: '房间不存在' });
  if (room.players.B) return send(ws, 'ERROR', { message: '房间已满' });
  if (room.players.A.nickname === nickname) return send(ws, 'ERROR', { message: '昵称已被使用' });
  const session = token();
  room.players.B = { nickname, ready: false, webSocket: ws, session, continueReady: false, lineupReady: false };
  ws.room = code;
  ws.side = 'B';
  send(ws, 'SESSION', { code, side: 'B', token: session });
  broadcast(room);
  console.log(`[room] joined ${code}`);
}

export function reconnect(ws, code, session) {
  const room = rooms.get(code);
  if (!room) return send(ws, 'ERROR', { message: '房间已过期' });
  const side = ['A', 'B'].find(s => room.players[s]?.session === session);
  if (!side) return send(ws, 'ERROR', { message: '重连令牌无效' });
  room.players[side].webSocket = ws;
  if (room.players[side].disconnectTimer) {
    clearTimeout(room.players[side].disconnectTimer);
  }
  ws.room = code;
  ws.side = side;
  send(ws, 'SESSION', { code, side, token: session, reconnected: true });
  broadcast(room);
  console.log(`[room] reconnected ${code} ${side}`);
}

export function onMessage(ws, raw) {
  if (raw.length > 4096) return send(ws, 'ERROR', { message: '消息过长' });
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return send(ws, 'ERROR', { message: '消息格式错误' });
  }
  if (msg.protocol !== PROTOCOL) return send(ws, 'ERROR', { message: '协议版本不一致，请刷新页面' });
  if (limited(`${ws.ip}:${msg.type}`)) return send(ws, 'ERROR', { message: '操作过于频繁' });
  const p = msg.payload || {};
  if (msg.type === 'CREATE') {
    if (!validName(p.nickname)) return send(ws, 'ERROR', { message: '昵称需为2-16个中英文、数字或下划线' });
    return createRoom(ws, p.nickname);
  }
  if (msg.type === 'JOIN') {
    if (!validName(p.nickname) || !/^[0-9]{6}$/.test(p.code)) return send(ws, 'ERROR', { message: '昵称或房间码无效' });
    return joinRoom(ws, p.code, p.nickname);
  }
  if (msg.type === 'RECONNECT') return reconnect(ws, p.code, p.token);
  const room = rooms.get(ws.room);
  const side = ws.side;
  if (!room || !side) return send(ws, 'ERROR', { message: '尚未加入房间' });
  if (msg.type === 'READY') {
    room.players[side].ready = !!p.ready;
    if (room.players.A?.ready && room.players.B?.ready) {
      setTimeout(() => startMatch(room), 3000);
    }
    broadcast(room);
  } else if (msg.type === 'ORDER') {
    if (handleOrder(room, side, p.choice)) broadcast(room);
    else send(ws, 'ERROR', { message: '当前不能选择顺位' });
  } else if (msg.type === 'ACTION') {
    if (handleAction(room, side, p.action, p.playerId)) broadcast(room);
    else send(ws, 'ERROR', { message: '非法禁选操作' });
  } else if (msg.type === 'CONTINUE') {
    advance(room, side);
    broadcast(room);
  } else if (msg.type === 'SWAP') {
    lineupSwap(room, side, p.a, p.b);
    broadcast(room);
  } else if (msg.type === 'LINEUP_READY') {
    room.players[side].lineupReady = true;
    finishLineupIfReady(room);
    broadcast(room);
  } else if (msg.type === 'FORFEIT') {
    finishByForfeit(room, side, '主动认输');
  } else if (msg.type === 'CHAT') {
    if (Date.now() - (room.players[side].lastChat || 0) < 3000) return;
    const allowed = ['你好', '准备好了吗', '我要拿前锋', '别抢我的人', '打得不错', '再来一局', '赞', '惊讶', '足球'];
    if (!allowed.includes(p.message)) return;
    room.players[side].lastChat = Date.now();
    room.chat.push({ side, message: p.message, at: Date.now() });
    broadcast(room);
  } else if (msg.type === 'REMATCH') {
    room.rematch[side] = true;
    if (room.rematch.A && room.rematch.B) {
      room.players.A.ready = true;
      room.players.B.ready = true;
      room.rematch = { A: false, B: false };
      startMatch(room);
    }
    broadcast(room);
  } else if (msg.type === 'GET_HISTORY') {
    if (room.players[side].session === p.token) send(ws, 'HISTORY', { history: room.history, game: room.game, forfeit: room.forfeit });
  }
}

export function startMatch(room) {
  room.game = createGame({ seed: Date.now(), difficulty: 'hard', personality: 'power' });
  room.status = 'playing';
  room.choiceOwner = Math.random() < 0.5 ? 'A' : 'B';
  room.game.phase = 'ORDER';
  room.history = [];
  setDeadline(room, 15);
  console.log(`[game] room ${room.code} started`);
}

export function createGame(settings = {}) {
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

export function startRound(game, playerOrder) {
  const first = playerOrder === 'first' ? 'player' : 'ai';
  return { ...game, phase: 'BAN', firstBanner: first, banTurn: first, banCount: 0, bans: [], selectedId: null };
}

export function banPlayer(game, actor, playerId, reason = '') {
  if (game.phase !== 'BAN' || game.banTurn !== actor || !available(game).some(p => p.id === playerId)) return game;
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

export function pickPlayer(game, actor, playerId) {
  if (game.phase !== 'PICK' || game.pickTurn !== actor || !available(game).some(p => p.id === playerId)) return game;
  const picks = { player: [...game.picks.player], ai: [...game.picks.ai] };
  picks[actor].push(game.candidates.find(p => p.id === playerId));
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

export function nextRound(game) {
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

export function swapSlots(game, side, a, b) {
  const layout = { ...game.layouts[side] };
  [layout[a], layout[b]] = [layout[b], layout[a]];
  return { ...game, layouts: { ...game.layouts, [side]: layout } };
}

export function finalizeDraft(game) {
  const layouts = { player: optimizeLayout(game.picks.player), ai: optimizeLayout(game.picks.ai) };
  return { ...game, phase: 'LINEUP', layouts };
}

export function optimizeLayout(roster) {
  const groups = { FWD: roster.filter(p => p.position === 'FWD'), MID: roster.filter(p => p.position === 'MID'), DEF: roster.filter(p => p.position === 'DEF') };
  return {
    ...permutationsAssign(groups.FWD, ['LW', 'ST', 'RW']),
    ...permutationsAssign(groups.MID, ['CM1', 'CDM', 'CM2']),
    ...permutationsAssign(groups.DEF, ['LB', 'CB1', 'CB2', 'RB']),
    GK: RULES.courtois
  };
}

function permutationsAssign(players, slots) {
  const remaining = [...players];
  const assigned = {};
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

function fit(player, slot) {
  if (slot === 'GK') return player.id === 'shared_courtois' ? 1 : player.detailedPosition === 'GK' ? 1 : 0.92;
  const positions = [player.detailedPosition, ...(player.alternativePositions || [])];
  const slotAccept = { LW: ['LW', 'LM', 'ST', 'RW'], ST: ['ST', 'CF', 'LW', 'RW'], RW: ['RW', 'RM', 'ST', 'LW'], CM1: ['CM', 'CAM', 'CDM', 'LM', 'RM'], CM2: ['CM', 'CAM', 'CDM', 'LM', 'RM'], CDM: ['CDM', 'CM', 'CB', 'CAM'], LB: ['LB', 'LWB', 'CB'], RB: ['RB', 'RWB', 'CB'], CB1: ['CB', 'LB', 'RB', 'CDM'], CB2: ['CB', 'LB', 'RB', 'CDM'], GK: ['GK'] };
  const index = slotAccept[slot]?.findIndex(p => positions.includes(p)) ?? -1;
  return index === 0 ? 1 : index > 0 ? 0.96 : 0.92;
}

export function simulateSeries(game) {
  const seed = game.seed ^ 0x9e3779b9;
  const rng = createRng(seed);
  const pe = evaluateRoster(game.picks.player, game.layouts.player);
  const ae = evaluateRoster(game.picks.ai, game.layouts.ai);
  const matches = [];
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

function poisson(lambda, rng) {
  let p = 1, k = 0;
  const limit = Math.exp(-lambda);
  do {
    k++;
    p *= rng.next();
  } while (p > limit && k < 12);
  return k - 1;
}

function createRng(seed) {
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

function evaluateRoster(roster, layout = optimizeLayout(roster)) {
  const lineSlots = { GK: ['GK'], DEF: ['LB', 'CB1', 'CB2', 'RB'], MID: ['CM1', 'CDM', 'CM2'], FWD: ['LW', 'ST', 'RW'] };
  const weights = { GK: 0.1, DEF: 0.3, MID: 0.3, FWD: 0.3 };
  let paper = 0;
  const lines = {};
  Object.entries(lineSlots).forEach(([line, slots]) => {
    lines[line] = slots.reduce((s, slot) => s + (layout[slot]?.rating || 60) * fit(layout[slot] || {}, slot), 0) / slots.length;
    paper += lines[line] * weights[line];
  });
  const outfield = Object.values(layout).filter(p => p && p.id !== 'shared_courtois');
  const slotFit = Object.entries(layout).reduce((s, [slot, p]) => s + (slot === 'GK' ? 0 : fit(p, slot)), 0) / 10 * 32;
  const template = (['LW', 'ST', 'RW'].every(s => fit(layout[s], s) >= 0.96) ? 3 : 0) + (['CM1', 'CDM', 'CM2'].every(s => fit(layout[s], s) >= 0.96) ? 2 : 0) + (['LB', 'CB1', 'CB2', 'RB'].every(s => fit(layout[s], s) >= 0.96) ? 3 : 0);
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

function groupComponent(players, key, steps, cap) {
  const groups = {};
  players.forEach(p => {
    const value = p[key];
    if (value) groups[value] = (groups[value] || 0) + 1;
  });
  let score = 0;
  steps.forEach(([n, v]) => { if (Object.values(groups).some(c => c >= n)) score = v; });
  return Math.min(cap, score);
}

const CN_NAMES = {
  'Kylian Mbappé': '基利安·姆巴佩', 'Rodri': '罗德里', 'Erling Haaland': '埃尔林·哈兰德', 'Jude Bellingham': '裘德·贝林厄姆',
  'Vinícius Júnior': '维尼修斯·儒尼奥尔', 'Kevin De Bruyne': '凯文·德布劳内', 'Harry Kane': '哈里·凯恩', 'Mohamed Salah': '穆罕默德·萨拉赫',
  'Lautaro Martínez': '劳塔罗·马丁内斯', 'Robert Lewandowski': '罗伯特·莱万多夫斯基', 'Thibaut Courtois': '蒂博·库尔图瓦',
  'Virgil van Dijk': '维吉尔·范戴克', 'Alisson': '阿利松', 'Ederson': '埃德森', 'Rúben Dias': '鲁本·迪亚斯',
  'Antonio Rüdiger': '安东尼奥·吕迪格', 'William Saliba': '威廉·萨利巴', 'Federico Valverde': '费德里科·巴尔韦德',
  'Martin Ødegaard': '马丁·厄德高', 'Bruno Fernandes': '布鲁诺·费尔南德斯', 'Bernardo Silva': '贝尔纳多·席尔瓦',
  'Bukayo Saka': '布卡约·萨卡', 'Phil Foden': '菲尔·福登', 'Jamal Musiala': '贾马尔·穆西亚拉', 'Florian Wirtz': '弗洛里安·维尔茨',
  'Pedri': '佩德里', 'Gavi': '加维', 'Rodrygo': '罗德里戈', 'Antoine Griezmann': '安托万·格列兹曼',
  'Victor Osimhen': '维克托·奥斯梅恩', 'Khvicha Kvaratskhelia': '赫维恰·克瓦拉茨赫利亚', 'Son Heung Min': '孙兴慜',
  'Cristiano Ronaldo': '克里斯蒂亚诺·罗纳尔多', 'Lionel Messi': '利昂内尔·梅西', 'Neymar Jr': '内马尔',
  'Declan Rice': '德克兰·赖斯', 'Joshua Kimmich': '约书亚·基米希', 'João Cancelo': '若昂·坎塞洛', 'Achraf Hakimi': '阿什拉夫·哈基米',
  'Theo Hernández': '特奥·埃尔南德斯', 'Mike Maignan': '迈克·迈尼昂', 'Gianluigi Donnarumma': '詹路易吉·多纳鲁马',
  'Marc-André ter Stegen': '马克-安德烈·特尔施特根', 'Cole Palmer': '科尔·帕尔默', 'Ousmane Dembélé': '奥斯曼·登贝莱',
  'Raphinha': '拉菲尼亚', 'Lamine Yamal': '拉明·亚马尔', 'Alexander Isak': '亚历山大·伊萨克', 'Julián Álvarez': '胡利安·阿尔瓦雷斯',
  'Nico Williams': '尼科·威廉斯', 'Désiré Doué': '德西雷·杜埃', 'Michael Olise': '迈克尔·奥利塞', 'Joško Gvardiol': '约什科·格瓦迪奥尔',
  'Alessandro Bastoni': '亚历山德罗·巴斯托尼', 'Marquinhos': '马尔基尼奥斯', 'Gabriel': '加布里埃尔',
  'Trent Alexander-Arnold': '特伦特·亚历山大·阿诺德', 'Andrew Robertson': '安德鲁·罗伯逊', 'Nuno Mendes': '努诺·门德斯',
  'Dani Carvajal': '达尼·卡瓦哈尔', 'Alejandro Grimaldo': '亚历杭德罗·格里马尔多', 'Nicolò Barella': '尼科洛·巴雷拉',
  'Frenkie de Jong': '弗兰基·德容', 'Alexis Mac Allister': '亚历克西斯·麦卡利斯特', 'Vitinha': '维蒂尼亚',
  'Hakan Çalhanoğlu': '哈坎·恰尔汗奥卢', 'Aurélien Tchouaméni': '奥雷利安·楚阿梅尼', 'Eduardo Camavinga': '爱德华多·卡马文加'
};

export function preparePlayers() {
  return PLAYER_DATA.map(p => ({ ...p, nameZh: CN_NAMES[p.englishName] || p.name, alternativePositions: p.alternativePositions || [] }));
}

function tierChunk(pool, need, rng) {
  const selected = [...pool].sort((a, b) => b.rating - a.rating).slice(0, need);
  const tierSize = Math.ceil(selected.length / 4);
  const tiers = [0, 1, 2, 3].map(i => shuffle(selected.slice(i * tierSize, (i + 1) * tierSize), rng));
  const rounds = [];
  while (rounds.flat().length < need) {
    const round = [];
    tiers.forEach(tier => round.push(...tier.splice(0, Math.min(3, tier.length))));
    rounds.push(shuffle(round, rng));
  }
  return rounds;
}

function shuffle(list, rng) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateCandidateRounds(players, seed) {
  const rng = createRng(seed);
  const groups = { FWD: [], MID: [], DEF: [] };
  Object.keys(groups).forEach(category => {
    groups[category] = tierChunk(players.filter(p => p.position === category), RULES.categoryNeeds[category], rng);
  });
  const indexes = { FWD: 0, MID: 0, DEF: 0 };
  return RULES.rounds.map(rule => groups[rule.category][indexes[rule.category]++]);
}

export { rooms, rate };
