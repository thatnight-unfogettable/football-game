// 单房间状态机 + 事件循环
// 所有游戏规则来自 src/engine.js，确保前端人机与联机端一致。
import {
  newGameState,
  applyOrder,
  applyPrePick,
  applyBan,
  applyPostPick,
  advanceRound,
  startMatch90,
  drawMatchCards,
  aiPickMatchCard,
  setTacticalStyle,
  advanceToMinute,
  startPenaltyShootout,
  finishMatch90,
  resolveMatch90,
  activeSide,
  availableIds,
  createRng,
  assignToSlots,
  lineupMetrics,
  COURTOIS,
  BANS_PER_ROUND,
  EVENT_BY_ID,
  STYLE_BY_ID,
} from '../src/engine.js';

export const ACTION_TIMEOUT_MS = 30_000;
const ORDER_TIMEOUT_MS = 15_000;

export function createRoom(code) {
  return {
    code,
    status: 'lobby',           // lobby | playing | finished
    createdAt: Date.now(),
    players: { A: null, B: null },
    game: null,                 // engine state
    rng: null,
    choiceOwner: null,          // 'A' | 'B'
    continueReady: { A: false, B: false },
    deadline: null,
    timer: null,
    chat: [],
    rematch: { A: false, B: false },
    history: [],
    pending: null,              // 当前等待的输入：'ORDER'|'PRE_PICK'|'BAN'|'POST_PICK'|'EVENT_CARD'|'MATCH_PLAY'|'CONTINUE'
    forfeit: null,
    startTimer: null,           // 双方到齐后自动开赛的倒计时句柄
  };
}

function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function setDeadline(room, ms, onExpire) {
  clearTimer(room);
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(onExpire, ms);
  if (room.status === 'playing') broadcast(room);
}

function clearDeadline(room) {
  clearTimer(room);
  room.deadline = null;
}

function opponent(side) { return side === 'A' ? 'B' : 'A'; }

function bothConnected(room) {
  return room.players.A?.ws && room.players.B?.ws;
}

function bothReady(room) {
  return room.players.A?.ready && room.players.B?.ready;
}

// 对外暴露 setDeadline/broadcast 的钩子，由 server.js 注入
let _broadcast = () => {};
export function setBroadcast(fn) { _broadcast = fn; }
function broadcast(room) { _broadcast(room); }

function chooseAuto(room, side, action) {
  const ids = availableIds(room.game);
  if (!ids.length) return null;
  // 超时走随机（避免依赖完整 AI 思考链）
  return ids[Math.floor(Math.random() * ids.length)];
}

function startMatch(room) {
  room.game = newGameState({ difficulty: 'normal', personality: 'power' });
  // 服务端的 RNG 用 seed 驱动，便于复现
  room.rng = createRng(room.game.seed);
  room.status = 'playing';
  room.choiceOwner = Math.random() < 0.5 ? 'A' : 'B';
  room.game.phase = 'ORDER';
  room.game.firstPicker = null;
  room.game.firstBan = null;
  room.game.prePicks = [];
  room.game.postPicks = [];
  room.game.roundBans = [];
  room.game.banTurn = 0;
  room.game.banCount = 0;
  room.game.pickOwners = {};
  room.game.roundPickIds = { A: [], B: [] };
  room.continueReady = { A: false, B: false };
  room.history.push({ type: 'START', at: Date.now() });
  setDeadline(room, ORDER_TIMEOUT_MS, () => onTimeout(room));
}

function onTimeout(room) {
  if (room.status !== 'playing') return;
  const g = room.game;
  // ORDER: choiceOwner 自动选后手
  if (g.phase === 'ORDER') {
    handleOrder(room, room.choiceOwner, 'last', true);
    return;
  }
  const side = activeSide(g);
  if (!side) return;
  if (g.phase === 'BAN') {
    const id = chooseAuto(room, side, 'ban');
    if (id) handleAction(room, side, 'BAN', id, true);
  } else if (g.phase === 'PRE_PICK') {
    const id = chooseAuto(room, side, 'pick');
    if (id) handlePrePick(room, side, id, true);
  } else if (g.phase === 'POST_PICK' || g.phase === 'PICK') {
    const id = chooseAuto(room, side, 'pick');
    if (id) handlePostPick(room, side, id, true);
  } else if (g.phase === 'match') {
    // 比赛出牌：超时自动 AI 选
    const m = g.match;
    if (!m) return;
    if (m.phase === 'match_important') {
      // 重要模式超时 → 自动按继续
      handleMatchContinue(room, side === 'A' ? 'B' : 'A');
      handleMatchContinue(room, side);
    } else if (m.phase === 'match_draw') {
      const hand = side === 'A' ? m.aDraw.filter(id => !m.aPlayed.includes(id)) : m.bDraw.filter(id => !m.bPlayed.includes(id));
      if (!hand.length) {
        // 没手牌就快进
        handleFastForward(room, side);
      } else {
        const cardId = aiPickMatchCard(room.rng, hand);
        handlePlayCard(room, side, cardId);
      }
    }
  } else if (g.phase === 'tactical_pick') {
    // 战术超时：AI 自动选 longball
    if (!g.match) g.match = {};
    if (side === 'A' && !g.match.aStyle) handleSetStyle(room, 'A', 'longball');
    else if (side === 'B' && !g.match.bStyle) handleSetStyle(room, 'B', 'longball');
  }
}

export function handleCreate(room, ws, nickname) {
  room.players.A = { nickname, ready: false, ws, session: ws.session, continueReady: false, lineupReady: false };
  ws.room = room.code;
  ws.side = 'A';
}

export function handleJoin(room, ws, nickname) {
  room.players.B = { nickname, ready: false, ws, session: ws.session, continueReady: false, lineupReady: false };
  ws.room = room.code;
  ws.side = 'B';
}

// 双方都成功上线后，自动开始 1.5 秒倒计时开赛
export function handleAutoStart(room) {
  if (room.status !== 'lobby') return;
  if (!bothConnected(room)) return;
  // 已经启动过倒计时就不再启动
  if (room.startTimer) return;
  console.log(`[room] ${room.code} full, auto-start in 1.5s`);
  room.startTimer = setTimeout(() => {
    room.startTimer = null;
    if (room.status !== 'lobby') return;
    if (!bothConnected(room)) return;
    startMatch(room);
    broadcast(room);
  }, 1500);
}

export function handleReady(room, side, ready) {
  const p = room.players[side];
  if (!p) return false;
  p.ready = !!ready;
  if (bothReady(room)) {
    setTimeout(() => {
      if (bothReady(room) && room.status === 'lobby') startMatch(room);
    }, 3000);
  }
  return true;
}

export function handleOrder(room, side, choice, auto = false) {
  const g = room.game;
  if (g.phase !== 'ORDER') return { ok: false, error: '当前不在选择先后手阶段' };
  if (room.choiceOwner !== side && !auto) return { ok: false, error: '还没轮到你选择先后手' };
  const r = applyOrder(g, side, choice);
  if (!r.ok) return r;
  room.history.push({ type: 'ORDER', side, choice, auto, at: Date.now() });
  // applyOrder 已把 firstPicker/firstBan 设置好。choiceOwner 留给下一轮开始时再切换。
  // 回合推进由 STATE 消息驱动：客户端用 m.activeSide 判断能不能出手。
  if (g.phase === 'PRE_PICK' || g.phase === 'BAN' || g.phase === 'POST_PICK' || g.phase === 'PICK') {
    setDeadline(room, ACTION_TIMEOUT_MS, () => onTimeout(room));
  } else {
    clearDeadline(room);
  }
  return { ok: true };
}

export function handlePrePick(room, side, id, auto = false) {
  const r = applyPrePick(room.game, side, id);
  if (!r.ok) return r;
  if (room.game.phase === 'BAN') {
    // 进入 ban 阶段，活跃方是 firstBan
    setDeadline(room, ACTION_TIMEOUT_MS, () => onTimeout(room));
  } else {
    setDeadline(room, ACTION_TIMEOUT_MS, () => onTimeout(room));
  }
  return { ok: true };
}

export function handlePostPick(room, side, id, auto = false) {
  const r = applyPostPick(room.game, side, id);
  if (!r.ok) return r;
  if (room.game.phase === 'ROUND_END') {
    // 等双方都按继续
    clearDeadline(room);
  } else {
    setDeadline(room, ACTION_TIMEOUT_MS, () => onTimeout(room));
  }
  return { ok: true };
}

export function handleAction(room, side, type, id, auto = false) {
  if (type === 'BAN') return handleBan(room, side, id, auto);
  if (type === 'PRE_PICK') return handlePrePick(room, side, id, auto);
  if (type === 'POST_PICK' || type === 'PICK') return handlePostPick(room, side, id, auto);
  return { ok: false, error: '未知操作类型' };
}

export function handleBan(room, side, id, auto = false) {
  const r = applyBan(room.game, side, id);
  if (!r.ok) return r;
  if (room.game.phase === 'POST_PICK' || room.game.phase === 'PICK') {
    setDeadline(room, ACTION_TIMEOUT_MS, () => onTimeout(room));
  } else {
    setDeadline(room, ACTION_TIMEOUT_MS, () => onTimeout(room));
  }
  return { ok: true };
}

// "继续" 按钮：A/B 各自标记 continueReady，都点了再 advanceRound
export function handleContinue(room, side) {
  if (room.game.phase !== 'ROUND_END') return { ok: false, error: '本轮还未完成' };
  room.continueReady[side] = true;
  if (room.continueReady.A && room.continueReady.B) {
    room.continueReady.A = false;
    room.continueReady.B = false;
    const r = advanceRound(room.game);
    if (!r.ok) return r;
    if (room.game.phase === 'LINEUP') {
      setDeadline(room, 60_000, () => onLineupTimeout(room));
    } else {
      // 下一轮 ORDER，choiceOwner 交替
      room.choiceOwner = room.choiceOwner === 'A' ? 'B' : 'A';
      setDeadline(room, ORDER_TIMEOUT_MS, () => onTimeout(room));
    }
  }
  return { ok: true };
}

function onLineupTimeout(room) {
  // 超时自动确认阵容
  for (const side of ['A', 'B']) room.players[side].lineupReady = true;
  finishLineupIfReady(room);
}

// 阵容阶段的 SWAP：交换 slot（暂未在 UI 实现，协议保留）
export function handleSwap(room, side, a, b) {
  if (room.game.phase !== 'LINEUP') return { ok: false, error: '当前不在阵容阶段' };
  if (a === 'GK' || b === 'GK') return { ok: false, error: '不能交换门将' };
  const layout = { ...room.game.lineup[side] };
  [layout[a], layout[b]] = [layout[b], layout[a]];
  room.game.lineup[side] = layout;
  return { ok: true };
}

export function handleLineupReady(room, side) {
  if (room.game.phase !== 'LINEUP') return { ok: false, error: '当前不在阵容阶段' };
  room.players[side].lineupReady = true;
  if (room.players.A.lineupReady && room.players.B.lineupReady) {
    finishLineupIfReady(room);
  }
  return { ok: true };
}

function finishLineupIfReady(room) {
  // 阵容阶段完成 → 进入战术选择
  room.continueReady.A = false;
  room.continueReady.B = false;
  room.game.phase = 'tactical_pick';
  room.game.match = { aStyle: null, bStyle: null, aDraw: [], bDraw: [] };
  room.pending = 'TACTICAL_PICK';
  setDeadline(room, 60_000, () => onTimeout(room));
}

// 玩家选择战术风格
export function handleSetStyle(room, side, styleId) {
  if (room.game.phase !== 'tactical_pick') {
    return { ok: false, error: '当前阶段不能设置战术' };
  }
  if (!STYLE_BY_ID[styleId]) return { ok: false, error: '未知战术风格' };
  // 确保 match 对象存在
  if (!room.game.match) room.game.match = {};
  setTacticalStyle(room.game, side, styleId);
  room.history.push({ type: 'SET_STYLE', side, styleId, at: Date.now() });
  // 检查双方是否都选了
  const m = room.game.match;
  if (m.aStyle && m.bStyle && room.game.phase === 'tactical_pick') {
    // 初始化 90 分钟比赛
    startMatch90(room.game, room.rng);
    // startMatch90 会用 prevAStyle/prevBStyle 保留战术，但需重置其他手牌与已出牌字段
    room.game.match.phase = 'match_draw';
    room.game.match.aDraw = room.game.match.aDraw || [];
    room.game.match.bDraw = room.game.match.bDraw || [];
    room.game.match.aPlayed = [];
    room.game.match.bPlayed = [];
    room.game.match.aPending = [];
    room.game.match.bPending = [];
    room.game.match.aChoice = null;
    room.game.match.bChoice = null;
    room.game.match.importantEvents = [];
    room.game.match.tickMinute = 0;
    room.pending = 'MATCH_DRAW';
    clearDeadline(room);
    setDeadline(room, 60_000, () => onTimeout(room));
  }
  return { ok: true };
}

// 玩家出牌（同时出）
export function handlePlayCard(room, side, cardId) {
  const m = room.game.match;
  if (!m || m.phase !== 'match_draw') return { ok: false, error: '当前不在出牌阶段' };
  const hand = side === 'A' ? m.aDraw : m.bDraw;
  if (cardId && !hand.includes(cardId)) return { ok: false, error: '不在手牌中' };
  // 如果玩家没手牌可打，cardId 为 null
  if (side === 'A') m.aChoice = cardId;
  else m.bChoice = cardId;
  room.history.push({ type: 'PLAY_CARD', side, cardId, at: Date.now() });

  // 检查双方都选了
  if (m.aChoice !== null && m.bChoice !== null) {
    // 重置上一轮的 ACK，避免"快进"按钮遗留的标志影响下一轮
    m.fastForwardAck = { A: false, B: false };
    m.continueAck = { A: false, B: false };

    // 收集双方即时牌的目标分钟（取最大 + 5 分钟缓冲）
    const minuteTargets = [];
    [m.aChoice, m.bChoice].forEach((id, i) => {
      const s = i === 0 ? 'A' : 'B';
      if (!id) return;
      const card = EVENT_BY_ID[id];
      if (card?.type === 'instant') {
        // 即时牌只推进到 minute（不是 minuteEnd），避免双牌推进时分数翻倍
        minuteTargets.push(Math.min(card.minute, 90));
        (s === 'A' ? m.aPlayed : m.bPlayed).push(id);
      } else if (card?.type === 'modifier') {
        // 修正牌进 pending（其播报在 advanceToMinute 内统一处理）
        (s === 'A' ? m.aPending : m.bPending).push(card);
        m.importantEvents.push({
          tick: m.tickMinute,
          type: 'modifier_play',
          text: `${s === 'A' ? '玩家A' : '玩家B'}打出：${card.emoji} ${card.name}`,
          side: s,
          cardId: id,
        });
        (s === 'A' ? m.aPlayed : m.bPlayed).push(id);
      }
    });

    // 单次推进：避免双推进导致进球翻倍
    if (minuteTargets.length) {
      advanceToMinute(room.game, room.rng, Math.min(Math.max(...minuteTargets) + 5, 90));
    } else {
      // 全是修正牌时也走 5 分钟推进，保持节奏
      advanceToMinute(room.game, room.rng, Math.min(m.tickMinute + 5, 90));
    }

    m.aChoice = null;
    m.bChoice = null;

    if (m.tickMinute >= 90) {
      finishMatch90(room.game);
      if (room.game.phase === 'PENALTY') {
        startPenaltyShootout(room.game, room.rng);
        room.game.phase = 'PENALTY';
      } else {
        resolveMatch90(room.game);
        room.game.phase = 'RESULT';
        room.status = 'finished';
        room.finishedAt = Date.now();
      }
    } else {
      room.pending = 'MATCH_DRAW';
    }
    clearDeadline(room);
    setDeadline(room, 60_000, () => onTimeout(room));
  }
  return { ok: true };
}

// 快进 5 分钟（跳过出牌，双方都按了才推进）
export function handleFastForward(room, side) {
  const m = room.game.match;
  if (!m || m.phase !== 'match_draw') return { ok: false, error: '当前不在出牌阶段' };
  // 双边 ACK 后才推进
  if (!m.fastForwardAck) m.fastForwardAck = { A: false, B: false };
  m.fastForwardAck[side] = true;
  if (!(m.fastForwardAck.A && m.fastForwardAck.B)) return { ok: true };

  // 重置 ACK，下一次快进继续累计
  m.fastForwardAck = { A: false, B: false };
  advanceToMinute(room.game, room.rng, Math.min(m.tickMinute + 5, 90));
  m.tickMinute = Math.min(m.tickMinute + 5, 90);
  m.mode = 'fast';
  m.modeStartMin = m.tickMinute;

  if (m.tickMinute >= 90) {
    // 重置 ACK，避免遗留标志导致后续轮提前触发
    m.fastForwardAck = { A: false, B: false };
    finishMatch90(room.game);
    if (room.game.phase === 'PENALTY') {
      startPenaltyShootout(room.game, room.rng);
      room.game.phase = 'PENALTY';
    } else {
      resolveMatch90(room.game);
      room.game.phase = 'RESULT';
      room.status = 'finished';
      room.finishedAt = Date.now();
    }
  }
  clearDeadline(room);
  setDeadline(room, 60_000, () => onTimeout(room));
  return { ok: true };
}

// 继续（重要模式后）
export function handleMatchContinue(room, side) {
  // 切到快进模式，5 分钟
  const m = room.game.match;
  if (!m) return { ok: false, error: '比赛未开始' };
  // 双方都按了才切
  if (!m.continueAck) m.continueAck = { A: false, B: false };
  m.continueAck[side] = true;
  if (m.continueAck.A && m.continueAck.B) {
    m.continueAck = { A: false, B: false };
    advanceToMinute(room.game, room.rng, Math.min(m.tickMinute + 5, 90));
    m.tickMinute = Math.min(m.tickMinute + 5, 90);
    m.mode = 'fast';
    m.modeStartMin = m.tickMinute;
    if (m.tickMinute >= 90) {
      advanceToMinute(room.game, room.rng, 90);
      finishMatch90(room.game);
      if (room.game.phase === 'PENALTY') {
        startPenaltyShootout(room.game, room.rng);
        room.game.phase = 'PENALTY';
      } else {
        resolveMatch90(room.game);
        room.game.phase = 'RESULT';
        room.status = 'finished';
        room.finishedAt = Date.now();
      }
    }
    clearDeadline(room);
    setDeadline(room, 60_000, () => onTimeout(room));
  }
  return { ok: true };
}

// 点球大战后的查看结果
export function handlePenaltyReady(room, side) {
  const m = room.game.match;
  if (!m || !m.penalty) return { ok: false, error: '当前不在点球阶段' };
  resolveMatch90(room.game);
  room.game.phase = 'RESULT';
  room.status = 'finished';
  room.finishedAt = Date.now();
  clearDeadline(room);
  return { ok: true };
}

export function handleRematch(room, side) {
  room.rematch[side] = true;
  if (room.rematch.A && room.rematch.B) {
    room.rematch.A = false;
    room.rematch.B = false;
    for (const s of ['A', 'B']) if (room.players[s]) { room.players[s].ready = true; room.players[s].lineupReady = false; }
    startMatch(room);
  }
  return { ok: true };
}

export function handleForfeit(room, side, reason = '主动认输') {
  if (room.status === 'finished') return { ok: false, error: '对局已结束' };
  clearDeadline(room);
  room.status = 'finished';
  room.finishedAt = Date.now();
  room.forfeit = { loser: side, winner: opponent(side), reason };
  // 构造一个 result，方便前端展示
  room.game.result = {
    winner: opponent(side),
    ag: room.game.match?.ag ?? 0,
    bg: room.game.match?.bg ?? 0,
    penalty: room.game.match?.penalty || null,
    metrics: {
      A: room.game.lineup.A ? lineupMetrics(room.game.lineup.A, room.game.players) : null,
      B: room.game.lineup.B ? lineupMetrics(room.game.lineup.B, room.game.players) : null,
    },
    mvpId: null,
    forfeit: room.forfeit,
  };
  room.game.phase = 'RESULT';
  room.status = 'finished';
  room.history.push({ type: 'FORFEIT', ...room.forfeit, at: Date.now() });
  return { ok: true };
}

export function handleChat(room, side, message) {
  const allowed = ['你好','准备好了吗','我要拿前锋','别抢我的人','打得不错','再来一局','赞','惊讶','足球'];
  if (!allowed.includes(message)) return { ok: false, error: '预设消息' };
  const p = room.players[side];
  if (!p) return { ok: false, error: '未加入房间' };
  if (Date.now() - (p.lastChat || 0) < 3000) return { ok: false, error: '消息频率过高' };
  p.lastChat = Date.now();
  room.chat.push({ side, message, at: Date.now() });
  if (room.chat.length > 50) room.chat.splice(0, room.chat.length - 50);
  return { ok: true };
}
