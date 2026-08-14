import { RoomDO } from './cloudflare/roomdo';
import { rooms, roomCode, rate, validName, onMessage, createRoom, joinRoom, reconnect, send, broadcast } from './cloudflare/room';

export interface Env {
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

const PROTOCOL = 1;

function getClientIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 
         request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
         request.headers.get('X-Real-IP') || 
         'unknown';
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const ip = getClientIP(request);
    
    const allowedOrigins = (env.ALLOWED_ORIGINS || '*').split(',').filter(Boolean);
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes('*') ? '*' : allowedOrigins.join(', '),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (allowedOrigins.length && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
      return new Response('Origin not allowed', { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      });
    }

    // WebSocket endpoint
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 400 });
      }

      const id = env.ROOM.idFromName('main-room');
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    // API endpoints
    if (url.pathname === '/api/room/create') {
      return new Response(JSON.stringify({ code: roomCode() }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        rooms: rooms.size, 
        timestamp: Date.now() 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Clean up old rooms periodically
    if (Math.random() < 0.01) {
      const now = Date.now();
      for (const [code, room] of rooms) {
        if ((room.status === 'lobby' && now - room.createdAt > 600000) ||
            (room.status === 'finished' && now - room.finishedAt > 300000)) {
          if (room.timer) clearTimeout(room.timer);
          rooms.delete(code);
        }
      }
      for (const [key, times] of rate) {
        if (!times.some((t: number) => Date.now() - t < 10000)) {
          rate.delete(key);
        }
      }
    }

    // Serve static files
    let pathname = url.pathname;
    if (pathname === '/') pathname = '/index.html';

    try {
      const response = await env.ASSETS.fetch(request);
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Cache-Control': 'no-cache'
        }
      });
    } catch {
      // Fallback to Workers KV or direct file serving
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }
  }
};

export { RoomDO };
