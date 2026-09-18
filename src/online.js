const PROTOCOL = 3;
const TOKEN_KEY = 'bp-online-token';
const ROOM_KEY = 'bp-online-room';
const NICKNAME_KEY = 'bp-online-nickname';

function resolveWsHost() {
  // 1. 部署时通过 Vercel 环境变量 VITE_WS_HOST 注入（构建期常量）
  // 2. 运行时通过 window.__WS_HOST__ 注入
  // 3. 兜底：同源部署（Render / Railway 单体部署）
  const meta = typeof import.meta !== 'undefined' && import.meta.env;
  const fromBuild = meta && (meta.VITE_WS_HOST || meta.PUBLIC_WS_HOST);
  const fromWindow = typeof window !== 'undefined' && (window.__WS_HOST__ || window.WS_HOST);
  if (fromBuild) return String(fromBuild).replace(/^wss?:\/\//, '').replace(/\/+$/, '');
  if (fromWindow) return String(fromWindow).replace(/^wss?:\/\//, '').replace(/\/+$/, '');
  return null; // 同源
}

export class OnlineClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.socket = null;
    this.state = null;
    this.side = null;
    this.code = sessionStorage.getItem(ROOM_KEY);
    this.token = sessionStorage.getItem(TOKEN_KEY);
  }
  connect() {
    return new Promise((resolve, reject) => {
      const wsHost = resolveWsHost();
      let wsUrl;
      if (wsHost) {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${wsHost}/ws`;
      } else {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${location.host}/ws`;
      }
      console.log('[OnlineClient] Connecting to:', wsUrl);
      let settled = false;
      try {
        this.socket = new WebSocket(wsUrl);
      } catch (e) {
        console.error('[OnlineClient] Construct error:', e);
        reject(e);
        return;
      }
      this.socket.addEventListener('open', () => {
        settled = true;
        console.log('[OnlineClient] Connected');
        resolve();
        this.handlers.open?.();
      });
      this.socket.addEventListener('error', (e) => {
        console.error('[OnlineClient] Error:', e);
        if (!settled) {
          settled = true;
          // 浏览器 ErrorEvent 的 message / Node ws ErrorEvent 的 error.code
          const inner = e?.error || e;
          const message = inner?.message
            || (Array.isArray(inner?.errors) && inner.errors[0]?.message)
            || inner?.code
            || (e?.code ? `code=${e.code}` : 'WebSocket 连接失败');
          reject(new Error(String(message)));
        }
      });
      this.socket.addEventListener('close', (e) => {
        console.log('[OnlineClient] Closed:', e.code, e.reason);
        this.handlers.close?.(e);
        // 若 close 在 open 之前触发，说明连接建立失败
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket 连接失败 (code=${e.code}) ${e.reason || ''}`));
        }
      });
      this.socket.addEventListener('message', (event) => this.receive(event.data));
    });
  }
  receive(raw) {
    try {
      const message = JSON.parse(raw);
      console.log('[OnlineClient] Received:', message.type, message);
      
      if (message.type === 'SESSION') {
        this.code = message.payload.code;
        this.side = message.payload.side;
        this.token = message.payload.token;
        this.state = { code: this.code, you: this.side };
        sessionStorage.setItem(ROOM_KEY, this.code);
        sessionStorage.setItem(TOKEN_KEY, this.token);
        this.handlers.session?.(message.payload);
      } else if (message.type === 'STATE') {
        this.state = message.payload;
        this.side = message.payload.you;
        this.handlers.state?.(this.state);
      } else if (message.type === 'ERROR') {
        this.handlers.error?.(message.payload?.message || '未知错误');
      } else if (message.type === 'HISTORY') {
        this.handlers.history?.(message.payload);
      } else if (message.type === 'PONG') {
        // ignore
      }
    } catch (e) {
      console.error('[OnlineClient] Parse error:', e);
    }
  }
  send(type, payload = {}) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('[OnlineClient] Sending:', type, payload);
      this.socket.send(JSON.stringify({ type, payload, protocol: PROTOCOL }));
    } else {
      console.warn('[OnlineClient] Cannot send, socket not open:', this.socket?.readyState);
    }
  }
  create(nickname) { 
    localStorage.setItem(NICKNAME_KEY, nickname);
    this.send('CREATE', { nickname }); 
  }
  join(code, nickname) { 
    localStorage.setItem(NICKNAME_KEY, nickname);
    this.send('JOIN', { code: code.toUpperCase(), nickname }); 
  }
  reconnect() { 
    if (this.code && this.token) {
      console.log('[OnlineClient] Reconnecting with code:', this.code);
      this.send('RECONNECT', { code: this.code, token: this.token }); 
    }
  }
  clearSession() { 
    sessionStorage.removeItem(ROOM_KEY); 
    sessionStorage.removeItem(TOKEN_KEY); 
    this.code = null; 
    this.token = null; 
  }
}
