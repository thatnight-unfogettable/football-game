import { 
  token, validName, sanitize, createGame, startRound, banPlayer, pickPlayer, 
  nextRound, swapSlots, finalizeDraft, simulateSeries, playerSideToEngine, 
  engineSideToPlayer, evaluateRoster, available, optimizeLayout, createRng 
} from './game-logic';
import { RULES } from '../../game.js';

interface Player {
  nickname: string;
  ready: boolean;
  webSocketId: string;
  session: string;
  continueReady: boolean;
  lineupReady: boolean;
  lastChat?: number;
}

interface RoomState {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  createdAt: number;
  finishedAt?: number;
  players: {
    A: Player | null;
    B: Player | null;
  };
  game: any;
  choiceOwner: 'A' | 'B' | null;
  deadline: number | null;
  timerId?: number;
  chat: { side: string; message: string; at: number }[];
  rematch: { A: boolean; B: boolean };
  history: any[];
}

interface StoredRoom extends RoomState {
  deadline: number | null;
  timerId?: number;
}

export class RoomDO {
  private state: DurableObjectState;
  private room: RoomState | null = null;
  private wsA: WebSocket | null = null;
  private wsB: WebSocket | null = null;
  private ipA: string = '';
  private ipB: string = '';

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.initializeFromStorage();
  }

  private async initializeFromStorage() {
    const stored = await this.state.storage.get<StoredRoom>('room');
    if (stored) {
      this.room = {
        ...stored,
        timerId: undefined
      };
    }
  }

  private async saveRoom() {
    if (this.room) {
      const toSave: StoredRoom = {
        ...this.room,
        timerId: undefined
      };
      await this.state.storage.put('room', toSave);
    }
  }

  private setDeadline(seconds: number) {
    if (this.room) {
      this.room.deadline = Date.now() + seconds * 1000;
      if (this.room.timerId) {
        clearTimeout(this.room.timerId);
      }
      this.room.timerId = setTimeout(() => this.handleTimeout(), seconds * 1000) as unknown as number;
      this.saveRoom();
      this.broadcast();
    }
  }

  private handleTimeout() {
    if (!this.room || this.room.status !== 'playing') return;
    const g = this.room.game;
    
    if (g.phase === 'ORDER') {
      this.handleOrder(this.room.choiceOwner!, 'last', true);
      return;
    }
    if (g.phase === 'BAN') {
      const actor = engineSideToPlayer(g.banTurn);
      const id = this.chooseBest(actor, 'ban');
      this.handleAction(actor, 'BAN', id, true);
      return;
    }
    if (g.phase === 'PICK') {
      const actor = engineSideToPlayer(g.pickTurn);
      const id = this.chooseBest(actor, 'pick');
      this.handleAction(actor, 'PICK', id, true);
      return;
    }
    if (g.phase === 'LINEUP') {
      if (this.room.players.A) this.room.players.A.lineupReady = true;
      if (this.room.players.B) this.room.players.B.lineupReady = true;
      this.finishLineup();
    }
  }

  private chooseBest(side: string, action: string) {
    if (!this.room) return null;
    const engine = playerSideToEngine(side);
    const ids = available(this.room.game);
    if (action === 'pick') {
      return [...ids].sort((a, b) => {
        const pa = this.room!.game.players.find((p: any) => p.id === a);
        const pb = this.room!.game.players.find((p: any) => p.id === b);
        return pb.rating - pa.rating;
      })[0];
    }
    return [...ids].sort((a, b) => {
      const pa = this.room!.game.players.find((p: any) => p.id === a);
      const pb = this.room!.game.players.find((p: any) => p.id === b);
      return pb.rating - pa.rating;
    })[0];
  }

  private handleOrder(side: string, choice: string, auto = false) {
    if (!this.room || this.room.game.phase !== 'ORDER' || this.room.choiceOwner !== side) return;
    const engineSide = playerSideToEngine(side);
    const first = choice === 'first' ? engineSide : (engineSide === 'player' ? 'ai' : 'player');
    this.room.game = startRound(this.room.game, first === 'player' ? 'first' : 'last');
    this.room.history.push({ type: 'ORDER', side, choice, auto, at: Date.now() });
    this.setDeadline(30);
    this.saveRoom();
  }

  private handleAction(side: string, type: string, id: string, auto = false) {
    if (!this.room) return;
    const g = this.room.game;
    const engineSide = playerSideToEngine(side);
    
    if (type === 'BAN') {
      if (g.phase !== 'BAN' || g.banTurn !== engineSide) return;
      this.room.game = banPlayer(g, engineSide, id, auto ? '超时自动' : '在线玩家');
    } else {
      if (g.phase !== 'PICK' || g.pickTurn !== engineSide) return;
      this.room.game = pickPlayer(g, engineSide, id);
    }
    
    this.room.history.push({ type, side, id, auto, round: g.round, at: Date.now() });
    if (this.room.game.phase === 'ROUND_END') {
      this.room.deadline = null;
    } else {
      this.setDeadline(30);
    }
    this.saveRoom();
    this.broadcast();
  }

  private handleContinue(side: string) {
    if (!this.room || this.room.game.phase !== 'ROUND_END') return;
    const p = this.room.players[side as 'A' | 'B'];
    if (p) p.continueReady = true;
    
    if (this.room.players.A?.continueReady && this.room.players.B?.continueReady) {
      this.room.players.A.continueReady = false;
      this.room.players.B.continueReady = false;
      this.room.game = nextRound(this.room.game);
      
      if (this.room.game.phase === 'LINEUP') {
        this.room.players.A!.lineupReady = false;
        this.room.players.B!.lineupReady = false;
        this.setDeadline(60);
      } else {
        this.room.choiceOwner = this.room.choiceOwner === 'A' ? 'B' : 'A';
        this.setDeadline(15);
      }
    }
    this.saveRoom();
    this.broadcast();
  }

  private handleLineupSwap(side: string, a: string, b: string) {
    if (!this.room || this.room.game.phase !== 'LINEUP' || a === 'GK' || b === 'GK') return;
    const engine = playerSideToEngine(side);
    this.room.game = swapSlots(this.room.game, engine, a, b);
    this.saveRoom();
    this.broadcast();
  }

  private finishLineup() {
    if (!this.room) return;
    if (this.room.players.A?.lineupReady && this.room.players.B?.lineupReady) {
      this.room.game = simulateSeries(this.room.game);
      this.room.status = 'finished';
      this.room.deadline = null;
      this.room.finishedAt = Date.now();
      this.room.history.push({ type: 'RESULT', winner: engineSideToPlayer(this.room.game.winner), at: Date.now() });
      this.saveRoom();
      this.broadcast();
    }
  }

  private handleForfeit(loser: string, reason: string) {
    if (!this.room || this.room.status === 'finished') return;
    this.room.status = 'finished';
    this.room.finishedAt = Date.now();
    this.room.history.push({ type: 'FORFEIT', loser, winner: loser === 'A' ? 'B' : 'A', reason, at: Date.now() });
    this.saveRoom();
    this.broadcast();
  }

  private send(ws: WebSocket | null, type: string, payload: any = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload, protocol: 1 }));
    }
  }

  private broadcast() {
    if (!this.room) return;
    const stateA = sanitize(this.room, 'A');
    const stateB = sanitize(this.room, 'B');
    this.send(this.wsA, 'STATE', stateA);
    this.send(this.wsB, 'STATE', stateB);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 400 });
      }

      const { 0: client, 1: server } = new WebSocketPair();
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      
      server.accept();
      await this.handleWebSocket(server, ip);
      
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/create') {
      const nickname = url.searchParams.get('nickname') || '';
      if (!validName(nickname)) {
        return new Response(JSON.stringify({ error: '昵称无效' }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        });
      }
      
      const code = this.generateRoomCode();
      const session = token();
      
      this.room = {
        code,
        status: 'lobby',
        createdAt: Date.now(),
        players: { A: null, B: null },
        game: null,
        choiceOwner: null,
        deadline: null,
        chat: [],
        rematch: { A: false, B: false },
        history: []
      };
      
      await this.state.storage.put('roomCode', code);
      await this.saveRoom();
      
      return new Response(JSON.stringify({ code, side: 'A', token: session }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  private generateRoomCode(): string {
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  }

  private async handleWebSocket(ws: WebSocket, ip: string) {
    let side: 'A' | 'B' | null = null;
    
    // 检查是否已有连接
    if (this.room?.players.A) {
      this.wsA = ws;
      side = 'A';
      this.ipA = ip;
      this.send(ws, 'SESSION', { 
        code: this.room.code, 
        side: 'A', 
        token: this.room.players.A.session 
      });
    } else if (this.room?.players.B) {
      this.wsB = ws;
      side = 'B';
      this.ipB = ip;
      this.send(ws, 'SESSION', { 
        code: this.room.code, 
        side: 'B', 
        token: this.room.players.B.session 
      });
    }

    ws.addEventListener('message', async (event) => {
      try {
        const data = event.data.toString();
        await this.handleMessage(ws, data, ip, side!);
      } catch (err) {
        console.error('[ws] message error:', err);
      }
    });

    ws.addEventListener('close', async () => {
      if (side === 'A') {
        this.wsA = null;
      } else if (side === 'B') {
        this.wsB = null;
      }
    });

    ws.addEventListener('error', (err) => {
      console.error('[ws] error:', err);
    });
  }

  private async handleMessage(ws: WebSocket, raw: string, ip: string, side: 'A' | 'B') {
    if (raw.length > 4096) return this.send(ws, 'ERROR', { message: '消息过长' });
    
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.send(ws, 'ERROR', { message: '消息格式错误' });
    }
    
    if (msg.protocol !== 1) return this.send(ws, 'ERROR', { message: '协议版本不一致' });
    
    const p = msg.payload || {};
    
    // 处理登录消息
    if (msg.type === 'LOGIN') {
      if (!this.room) return;
      const nickname = p.nickname;
      if (!validName(nickname)) {
        return this.send(ws, 'ERROR', { message: '昵称需为2-16个中英文、数字或下划线' });
      }
      if (this.room.players.A?.nickname === nickname) {
        return this.send(ws, 'ERROR', { message: '昵称已被使用' });
      }
      
      const session = token();
      if (!this.room.players.A) {
        this.room.players.A = { nickname, ready: false, webSocketId: '1', session, continueReady: false, lineupReady: false };
        this.wsA = ws;
        this.ipA = ip;
        await this.state.storage.put('sideA', { nickname, session });
      } else if (!this.room.players.B) {
        this.room.players.B = { nickname, ready: false, webSocketId: '2', session, continueReady: false, lineupReady: false };
        this.wsB = ws;
        this.ipB = ip;
        await this.state.storage.put('sideB', { nickname, session });
      }
      
      await this.saveRoom();
      this.send(ws, 'SESSION', { code: this.room.code, side: side, token: session });
      this.broadcast();
      return;
    }
    
    if (msg.type === 'READY') {
      if (!this.room) return;
      const p = this.room.players[side];
      if (p) {
        p.ready = !!msg.payload.ready;
        if (this.room.players.A?.ready && this.room.players.B?.ready) {
          setTimeout(() => this.startMatch(), 3000);
        }
        await this.saveRoom();
        this.broadcast();
      }
      return;
    }
    
    if (msg.type === 'ORDER') {
      this.handleOrder(side, p.choice);
      return;
    }
    
    if (msg.type === 'ACTION') {
      this.handleAction(side, p.action, p.playerId);
      return;
    }
    
    if (msg.type === 'CONTINUE') {
      this.handleContinue(side);
      return;
    }
    
    if (msg.type === 'SWAP') {
      this.handleLineupSwap(side, p.a, p.b);
      return;
    }
    
    if (msg.type === 'LINEUP_READY') {
      if (!this.room) return;
      const player = this.room.players[side];
      if (player) player.lineupReady = true;
      await this.saveRoom();
      this.finishLineup();
      this.broadcast();
      return;
    }
    
    if (msg.type === 'FORFEIT') {
      this.handleForfeit(side, '主动认输');
      return;
    }
    
    if (msg.type === 'CHAT') {
      if (!this.room) return;
      const player = this.room.players[side];
      if (!player) return;
      if (Date.now() - (player.lastChat || 0) < 3000) return;
      const allowed = ['你好', '准备好了吗', '我要拿前锋', '别抢我的人', '打得不错', '再来一局', '赞', '惊讶', '足球'];
      if (!allowed.includes(p.message)) return;
      player.lastChat = Date.now();
      this.room.chat.push({ side, message: p.message, at: Date.now() });
      await this.saveRoom();
      this.broadcast();
      return;
    }
    
    if (msg.type === 'REMATCH') {
      if (!this.room) return;
      this.room.rematch[side] = true;
      if (this.room.rematch.A && this.room.rematch.B) {
        this.room.players.A!.ready = true;
        this.room.players.B!.ready = true;
        this.room.rematch = { A: false, B: false };
        this.startMatch();
      }
      await this.saveRoom();
      this.broadcast();
      return;
    }
    
    if (msg.type === 'GET_HISTORY') {
      if (!this.room) return;
      const player = this.room.players[side];
      if (player && player.session === p.token) {
        this.send(ws, 'HISTORY', { history: this.room.history, game: this.room.game });
      }
      return;
    }
  }

  private startMatch() {
    if (!this.room) return;
    this.room.game = createGame({ seed: Date.now(), difficulty: 'hard', personality: 'power' });
    this.room.status = 'playing';
    this.room.choiceOwner = Math.random() < 0.5 ? 'A' : 'B';
    this.room.game.phase = 'ORDER';
    this.room.history = [];
    this.setDeadline(15);
    this.saveRoom();
    console.log(`[game] room ${this.room.code} started`);
  }
}
