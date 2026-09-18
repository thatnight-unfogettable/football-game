// 绿茵禁选对决 - WebSocket 联机服务器
// 协议：与 src/engine.js / src/app.js 对齐
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PROTOCOL,
  activeSide,
  sanitizeForClient,
} from '../src/engine.js';
import {
  createRoom,
  setBroadcast,
  handleCreate,
  handleJoin,
  handleReady,
  handleOrder,
  handlePrePick,
  handlePostPick,
  handleBan,
  handleAction,
  handleContinue,
  handleSwap,
  handleLineupReady,
  handleEventCard,
  handlePlayMatch,
  handleNextMatch,
  handleRematch,
  handleForfeit,
  handleChat,
} from './room.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const rooms = new Map();
const sockets = new Map();           // ws.session -> ws
const ipRate = new Map();            // ip:type -> [timestamps]
const rateBySide = new Map();        // ws.session|side -> lastActionAt

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
};

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').filter(Boolean);
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS.join(', '),
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function token() { return crypto.randomBytes(24).toString('base64url'); }
function validName(name) {
  if (typeof name !== 'string') return false;
  const len = [...name].length;
  if (len < 2 || len > 16) return false;
  return /^[a-zA-Z0-9_\u4e00-\u9fff]+$/.test(name);
}
function roomCode() {
  let code;
  do { code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'); } while (rooms.has(code));
  return code;
}
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || '';
}
function rateLimited(key, limit = 20, windowMs = 5000) {
  const now = Date.now();
  const list = ipRate.get(key) || [];
  const fresh = list.filter(t => now - t < windowMs);
  fresh.push(now);
  ipRate.set(key, fresh);
  return fresh.length > limit;
}

function send(ws, type, payload = {}) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload, protocol: PROTOCOL }));
  }
}

function broadcast(room, type = 'STATE', payloadMaker = null) {
  if (!room) return;
  for (const side of ['A', 'B']) {
    const p = room.players[side];
    if (!p?.ws) continue;
    if (type === 'STATE') {
      send(p.ws, 'STATE', sanitizeForClientWithViewer(room, side));
    } else {
      send(p.ws, type, payloadMaker ? payloadMaker(side, p) : {});
    }
  }
}

// 让 room.js 内的 setDeadline 也能广播
setBroadcast(broadcast);

function sanitizeForClientWithViewer(room, viewer) {
  const state = sanitizeForClient(room.game || {});
  return {
    code: room.code,
    status: room.status,
    players: {
      A: room.players.A && {
        nickname: room.players.A.nickname,
        ready: room.players.A.ready,
        connected: !!room.players.A.ws,
        side: 'A',
      },
      B: room.players.B && {
        nickname: room.players.B.nickname,
        ready: room.players.B.ready,
        connected: !!room.players.B.ws,
        side: 'B',
      },
    },
    you: viewer,
    continueReady: room.continueReady,
    choiceOwner: room.choiceOwner,
    deadline: room.deadline,
    chat: room.chat.slice(-8),
    rematch: room.rematch,
    forfeit: room.forfeit,
    finishedAt: room.finishedAt,
    game: state,
  };
}

// ────────── HTTP 路由 ──────────
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes('*') && !ALLOWED_ORIGINS.includes(origin)) {
      res.writeHead(403, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
      res.end('Origin not allowed');
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/favicon.ico') {
      res.writeHead(204, { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=86400' });
      res.end();
      return;
    }
    if (pathname === '/api/health') {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, uptime: process.uptime() }));
      return;
    }
    const file = path.resolve(ROOT, `.${pathname}`);
    if (!file.startsWith(ROOT)) throw new Error('Forbidden');
    const data = await readFile(file);
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (err) {
    console.error('[http] error:', err.message);
    res.writeHead(404);
    res.end('Not found');
  }
});

// ────────── WebSocket ──────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes('*') && !ALLOWED_ORIGINS.includes(origin)) {
    console.log(`[socket] rejected origin: ${origin}`);
    ws.close(1008, 'Origin rejected');
    return;
  }
  ws.session = token();
  ws.ip = getClientIP(req);
  sockets.set(ws.session, ws);
  console.log(`[socket] connected ${ws.ip} session=${ws.session.slice(0, 8)}`);

  ws.on('message', data => {
    if (data.length > 4096) return send(ws, 'ERROR', { message: '消息过长' });
    let msg;
    try { msg = JSON.parse(data.toString()); }
    catch { return send(ws, 'ERROR', { message: '消息格式错误' }); }
    if (msg.protocol !== PROTOCOL) return send(ws, 'ERROR', { message: '协议版本不一致，请刷新页面' });
    if (rateLimited(`${ws.ip}:${msg.type}`)) return send(ws, 'ERROR', { message: '操作过于频繁' });
    if (['ORDER', 'ACTION', 'CREATE', 'JOIN', 'READY'].includes(msg.type)) {
      const room_key = ws.room;
      const room = room_key ? rooms.get(room_key) : null;
      console.log(`[ws-in] ${msg.type} from side=${ws.side || '?'} phase=${room?.game?.phase || '?'} payload=${JSON.stringify(msg.payload).slice(0, 100)}`);
    }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    sockets.delete(ws.session);
    handleDisconnect(ws);
  });
  ws.on('error', err => console.error(`[socket] error session=${ws.session?.slice(0,8)}:`, err.message));
});

function handleMessage(ws, msg) {
  const p = msg.payload || {};
  switch (msg.type) {
    case 'CREATE': return doCreate(ws, p);
    case 'JOIN':   return doJoin(ws, p);
    case 'RECONNECT': return doReconnect(ws, p);
    case 'READY':    return doReady(ws, p);
    case 'ORDER':    return doOrder(ws, p);
    case 'ACTION':   return doAction(ws, p);
    case 'CONTINUE': return doContinue(ws);
    case 'SWAP':     return doSwap(ws, p);
    case 'LINEUP_READY': return doLineupReady(ws);
    case 'EVENT_CARD':   return doEventCard(ws, p);
    case 'PLAY_MATCH':   return doPlayMatch(ws);
    case 'NEXT_MATCH':   return doNextMatch(ws);
    case 'REMATCH':      return doRematch(ws);
    case 'FORFEIT':      return doForfeit(ws);
    case 'CHAT':         return doChat(ws, p);
    case 'PING':         return send(ws, 'PONG');
    default:             return send(ws, 'ERROR', { message: `未知消息类型 ${msg.type}` });
  }
}

function roomOf(ws) {
  if (!ws?.room) return null;
  return rooms.get(ws.room);
}

// ────────── 业务处理 ──────────
function doCreate(ws, p) {
  if (ws.room) return send(ws, 'ERROR', { message: '你已在房间中' });
  if (!validName(p.nickname)) return send(ws, 'ERROR', { message: '昵称需为 2-16 个中英文、数字或下划线' });
  const code = roomCode();
  const room = createRoom(code);
  rooms.set(code, room);
  handleCreate(room, ws, p.nickname);
  send(ws, 'SESSION', { code, side: 'A', token: ws.session });
  broadcast(room, 'STATE');
  console.log(`[room] created ${code}`);
}

function doJoin(ws, p) {
  if (ws.room) return send(ws, 'ERROR', { message: '你已在房间中' });
  if (!validName(p.nickname)) return send(ws, 'ERROR', { message: '昵称需为 2-16 个中英文、数字或下划线' });
  if (!/^[0-9]{6}$/.test(p.code || '')) return send(ws, 'ERROR', { message: '房间码必须为 6 位数字' });
  const room = rooms.get(p.code);
  if (!room) return send(ws, 'ERROR', { message: '房间不存在' });
  if (room.status !== 'lobby') return send(ws, 'ERROR', { message: '对局已开始' });
  if (room.players.B) return send(ws, 'ERROR', { message: '房间已满' });
  if (room.players.A.nickname === p.nickname) return send(ws, 'ERROR', { message: '昵称已被使用' });
  handleJoin(room, ws, p.nickname);
  send(ws, 'SESSION', { code: room.code, side: 'B', token: ws.session });
  broadcast(room, 'STATE');
  console.log(`[room] joined ${room.code}`);
}

function doReconnect(ws, p) {
  const code = p.code, session = p.token;
  const room = rooms.get(code);
  if (!room) return send(ws, 'ERROR', { message: '房间已过期' });
  const side = ['A', 'B'].find(s => room.players[s]?.session === session);
  if (!side) return send(ws, 'ERROR', { message: '重连令牌无效' });
  const p_old = room.players[side];
  p_old.ws = ws;
  if (p_old.disconnectTimer) { clearTimeout(p_old.disconnectTimer); p_old.disconnectTimer = null; }
  ws.room = room.code; ws.side = side;
  send(ws, 'SESSION', { code, side, token: session, reconnected: true });
  broadcast(room, 'STATE');
  console.log(`[room] reconnected ${code} ${side}`);
}

function doReady(ws, p) {
  const room = roomOf(ws);
  if (!room || room.status !== 'lobby') return send(ws, 'ERROR', { message: '当前不在大厅' });
  handleReady(room, ws.side, !!p.ready);
  broadcast(room, 'STATE');
}

function doOrder(ws, p) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  const r = handleOrder(room, ws.side, p.choice);
  if (!r.ok) return send(ws, 'ERROR', { message: r.error });
  broadcast(room, 'STATE');
}

function doAction(ws, p) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  const r = handleAction(room, ws.side, p.action, p.playerId);
  if (!r.ok) {
    console.log(`[debug] action reject: side=${ws.side} action=${p.action} playerId=${p.playerId} reason=${r.error} phase=${room.game.phase} active=${activeSide(room.game)} prePicks=${room.game.prePicks.length} postPicks=${room.game.postPicks.length} firstPicker=${room.game.firstPicker} firstBan=${room.game.firstBan}`);
    return send(ws, 'ERROR', { message: r.error });
  }
  broadcast(room, 'STATE');
}

function doContinue(ws) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  const r = handleContinue(room, ws.side);
  if (!r.ok) return send(ws, 'ERROR', { message: r.error });
  broadcast(room, 'STATE');
}

function doSwap(ws, p) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  const r = handleSwap(room, ws.side, p.a, p.b);
  if (!r.ok) return send(ws, 'ERROR', { message: r.error });
  broadcast(room, 'STATE');
}

function doLineupReady(ws) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  const r = handleLineupReady(room, ws.side);
  if (!r.ok) return send(ws, 'ERROR', { message: r.error });
  broadcast(room, 'STATE');
}

function doEventCard(ws, p) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  const r = handleEventCard(room, ws.side, p.cardId);
  if (!r.ok) return send(ws, 'ERROR', { message: r.error });
  broadcast(room, 'STATE');
}

function doPlayMatch(ws) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  const r = handlePlayMatch(room, ws.side);
  if (!r.ok) return send(ws, 'ERROR', { message: r.error });
  broadcast(room, 'STATE');
}

function doNextMatch(ws) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  const r = handleNextMatch(room, ws.side);
  if (!r.ok) return send(ws, 'ERROR', { message: r.error });
  broadcast(room, 'STATE');
}

function doRematch(ws) {
  const room = roomOf(ws);
  if (!room || room.status !== 'finished') return send(ws, 'ERROR', { message: '对局未结束' });
  handleRematch(room, ws.side);
  broadcast(room, 'STATE');
}

function doForfeit(ws) {
  const room = roomOf(ws);
  if (!room || !room.game) return send(ws, 'ERROR', { message: '尚未开始对局' });
  handleForfeit(room, ws.side, '主动认输');
  broadcast(room, 'STATE');
}

function doChat(ws, p) {
  const room = roomOf(ws);
  if (!room) return send(ws, 'ERROR', { message: '尚未加入房间' });
  const r = handleChat(room, ws.side, p.message);
  if (!r.ok) return send(ws, 'ERROR', { message: r.error });
  broadcast(room, 'STATE');
}

function handleDisconnect(ws) {
  if (!ws.room) return;
  const room = rooms.get(ws.room);
  if (!room) return;
  const p = room.players[ws.side];
  if (!p) return;
  p.ws = null;
  if (room.status === 'finished') return;
  // 大厅和对战中都给 90 秒重连窗口，超时再清理/判负
  p.disconnectTimer = setTimeout(() => {
    const fresh = rooms.get(room.code);
    if (!fresh) return;
    if (room.status === 'lobby') {
      // 大厅超时未归位 → 解散房间
      rooms.delete(room.code);
      console.log(`[room] ${room.code} removed (lobby player left and reconnect timeout)`);
      return;
    }
    if (room.status !== 'finished') {
      handleForfeit(room, ws.side, '断线超过 90 秒');
      broadcast(room, 'STATE');
    }
    setTimeout(() => {
      if (rooms.get(room.code) === room) rooms.delete(room.code);
    }, 5_000);
  }, 90_000);
  broadcast(room, 'STATE');
  console.log(`[socket] disconnected room=${ws.room} side=${ws.side}`);
}

// 房间清扫
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.status === 'lobby' && now - room.createdAt > 600_000) {
      rooms.delete(code);
    } else if (room.status === 'finished' && room.finishedAt && now - room.finishedAt > 300_000) {
      rooms.delete(code);
    }
  }
  for (const [k, ts] of ipRate) if (!ts.some(t => now - t < 10000)) ipRate.delete(k);
}, 30_000);

function getLocalIP() {
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const iface of os.networkInterfaces()[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  const lanUrl = localIP ? `http://${localIP}:${PORT}` : null;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  🏟️  绿茵禁选对决 - 服务器已启动`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  本机访问:  http://localhost:${PORT}`);
  if (lanUrl) {
    console.log(`  局域网:    ${lanUrl}`);
    console.log(`  (在同一网络下的设备可使用此地址)`);
  }
  console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`  协议版本:  ${PROTOCOL}`);
  console.log(`${'='.repeat(50)}\n`);
});

export { server, rooms };
