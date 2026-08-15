import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { PLAYER_DATA } from '../data/players.js';
import { optimizeLayout, evaluateRoster, simulateSeries, swapSlots } from '../src/game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const PROTOCOL = 1;
const rooms = new Map();
const rate = new Map();
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml' };

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').filter(Boolean);
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS.join(', '),
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.socket.remoteAddress 
    || '';
}

function send(ws,type,payload={}) { if(ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type,payload,protocol:PROTOCOL})); }
function roomCode(){let code;do{code=String(Math.floor(Math.random()*1_000_000)).padStart(6,'0');}while(rooms.has(code));return code;}
function token(){return crypto.randomBytes(24).toString('base64url');}
function validName(name){return typeof name==='string'&&/^[\p{Script=Han}A-Za-z0-9_]{2,16}$/u.test(name);}
function limited(key,limit=20,windowMs=5000){const now=Date.now(),row=rate.get(key)||[];const fresh=row.filter(t=>now-t<windowMs);fresh.push(now);rate.set(key,fresh);return fresh.length>limit;}
const ONLINE_ROUNDS=[{type:'double',category:'FWD',hint:'中锋/前锋'},{type:'double',category:'DEF',hint:'后卫'},{type:'double',category:'MID',hint:'中场'},{type:'double',category:'MID',hint:'中场'},{type:'single',category:'DEF',hint:'后卫'},{type:'single',category:'FWD',hint:'前锋'}];
function other(side){return side==='A'?'B':'A';}
function shuffled(list){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function buildRounds(){const used=new Set();return ONLINE_ROUNDS.map(rule=>{const size=rule.type==='double'?16:12;const pool=PLAYER_DATA.filter(p=>p.position===rule.category&&!used.has(p.id)).sort((a,b)=>b.rating-a.rating).slice(0,size*4);const candidates=shuffled(pool).slice(0,size).map(p=>p.id);candidates.forEach(id=>used.add(id));return {...rule,candidates};});}
function activeSide(game){if(game.phase==='PRE_PICK'||game.phase==='POST_PICK'||game.phase==='PICK')return (game.phase==='PRE_PICK'?game.prePicks:game.postPicks).length===0?game.firstPicker:other(game.firstPicker);if(game.phase==='BAN')return game.banTurn%2===0?game.firstBan:other(game.firstBan);return null;}
function availableIds(game){const removed=new Set([...game.roundBans.map(x=>x.id),...game.prePicks,...game.postPicks]);return game.candidates.filter(id=>!removed.has(id));}
function sanitize(room,viewer){const game=room.game;return {code:room.code,status:room.status,players:Object.fromEntries(Object.entries(room.players).map(([side,p])=>[side,p&&{nickname:p.nickname,ready:p.ready,connected:!!p.ws,side}])),you:viewer,choiceOwner:room.choiceOwner,deadline:room.deadline,chat:room.chat.slice(-8),rematch:room.rematch,game:game&&{...game,seed:room.status==='finished'?game.seed:null,activeSide:activeSide(game)}};}
function broadcast(room){for(const side of ['A','B']){const p=room.players[side];if(p?.ws)send(p.ws,'STATE',sanitize(room,side));}}
function setDeadline(room,seconds){clearTimeout(room.timer);room.deadline=Date.now()+seconds*1000;room.timer=setTimeout(()=>timeoutAction(room),seconds*1000);broadcast(room);}
function startMatch(room){const rounds=buildRounds();room.game={version:2,seed:Date.now(),phase:'ORDER',round:0,rounds,candidates:[],roundType:rounds[0].type,roundHint:rounds[0].hint,firstPicker:null,firstBan:null,banTurn:0,banCount:0,prePicks:[],postPicks:[],roundBans:[],bans:[],picks:{A:['shared_courtois'],B:['shared_courtois']},layouts:null,matches:[],winner:null,logs:[]};room.status='playing';room.choiceOwner=Math.random()<.5?'A':'B';room.history=[];setDeadline(room,15);console.log(`[game] room ${room.code} started`);}
function chooseBest(game){return [...availableIds(game)].sort((a,b)=>(PLAYER_DATA.find(p=>p.id===b)?.rating||0)-(PLAYER_DATA.find(p=>p.id===a)?.rating||0))[0];}
function timeoutAction(room){if(room.status!=='playing')return;const g=room.game;if(g.phase==='ORDER'){handleOrder(room,room.choiceOwner,'last',true);return;}const actor=activeSide(g),id=chooseBest(g);if(actor&&id)handleAction(room,actor,g.phase==='BAN'?'BAN':'PICK',id,true);else if(g.phase==='LINEUP'){for(const side of ['A','B'])room.players[side].lineupReady=true;finishLineupIfReady(room);}}
function handleOrder(room,side,choice,auto=false){const g=room.game;if(g.phase!=='ORDER'||room.choiceOwner!==side)return false;g.firstPicker=choice==='first'?side:other(side);g.candidates=[...g.rounds[g.round].candidates];g.roundType=g.rounds[g.round].type;g.roundHint=g.rounds[g.round].hint;g.prePicks=[];g.postPicks=[];g.roundBans=[];g.banTurn=0;g.banCount=0;if(g.roundType==='double'){g.phase='PRE_PICK';g.firstBan=g.firstPicker;}else{g.phase='BAN';g.firstBan=other(g.firstPicker);}g.logs.push({type:'ORDER',side,choice,auto,round:g.round,at:Date.now()});room.history.push({type:'ORDER',side,choice,auto,round:g.round,at:Date.now()});setDeadline(room,30);return true;}
function handleAction(room,side,type,id,auto=false){const g=room.game;if(activeSide(g)!==side||!availableIds(g).includes(id))return false;if(type==='BAN'){if(g.phase!=='BAN')return false;g.roundBans.push({side,id});g.bans.push({side,playerId:id,round:g.round});g.banTurn++;g.banCount=g.banTurn;if(g.banTurn>=6){g.postPicks=[];g.phase=g.roundType==='double'?'POST_PICK':'PICK';}}else{if(!['PRE_PICK','POST_PICK','PICK'].includes(g.phase))return false;const target=g.phase==='PRE_PICK'?g.prePicks:g.postPicks;target.push(id);g.picks[side].push(id);if(target.length>=2)g.phase=g.phase==='PRE_PICK'?'BAN':'ROUND_END';}const entry={type,side,id,auto,round:g.round,at:Date.now()};g.logs.push(entry);room.history.push(entry);if(g.phase==='ROUND_END'){clearTimeout(room.timer);room.deadline=null;broadcast(room);}else setDeadline(room,30);return true;}
function advance(room,side){const g=room.game;if(g.phase!=='ROUND_END')return false;room.players[side].continueReady=true;if(room.players.A.continueReady&&room.players.B.continueReady){room.players.A.continueReady=false;room.players.B.continueReady=false;g.round++;if(g.round>=g.rounds.length){g.phase='LINEUP';const a=g.picks.A.map(id=>id==='shared_courtois'?{id,name:'蒂博·库尔图瓦',rating:90,position:'GK',detailedPosition:'GK',alternativePositions:[]}:PLAYER_DATA.find(p=>p.id===id));const b=g.picks.B.map(id=>id==='shared_courtois'?{id,name:'蒂博·库尔图瓦',rating:90,position:'GK',detailedPosition:'GK',alternativePositions:[]}:PLAYER_DATA.find(p=>p.id===id));g.enginePicks={player:a,ai:b};g.layouts={player:optimizeLayout(a),ai:optimizeLayout(b)};room.players.A.lineupReady=false;room.players.B.lineupReady=false;setDeadline(room,60);}else{g.phase='ORDER';g.candidates=[];g.roundType=g.rounds[g.round].type;g.roundHint=g.rounds[g.round].hint;room.choiceOwner=other(room.choiceOwner);setDeadline(room,15);}}else broadcast(room);return true;}
function lineupSwap(room,side,a,b){if(room.game.phase!=='LINEUP'||a==='GK'||b==='GK')return false;const engine=side==='A'?'player':'ai';room.game=swapSlots(room.game,engine,a,b);return true;}
function finishLineupIfReady(room){if(!room.players.A.lineupReady||!room.players.B.lineupReady)return;clearTimeout(room.timer);const g=room.game;const simulated=simulateSeries({...g,picks:g.enginePicks});g.phase='RESULT';g.matches=simulated.matches;g.winner=simulated.winner==='player'?'A':'B';g.evaluations=simulated.evaluations;g.mvp=simulated.mvp;room.status='finished';room.deadline=null;room.finishedAt=Date.now();room.history.push({type:'RESULT',winner:g.winner,at:Date.now()});broadcast(room);console.log(`[game] room ${room.code} finished`);}
function finishByForfeit(room,loser,reason){if(room.status==='finished')return;clearTimeout(room.timer);room.status='finished';room.finishedAt=Date.now();room.forfeit={loser,winner:loser==='A'?'B':'A',reason};room.history.push({type:'FORFEIT',...room.forfeit,at:Date.now()});broadcast(room);}
function createRoom(ws,nickname){const code=roomCode(),side='A',session=token();const room={code,status:'lobby',createdAt:Date.now(),players:{A:{nickname,ready:true,ws,session,continueReady:false,lineupReady:false},B:null},game:null,choiceOwner:null,deadline:null,timer:null,chat:[],rematch:{A:false,B:false},history:[]};rooms.set(code,room);ws.room=code;ws.side=side;send(ws,'SESSION',{code,side,token:session});broadcast(room);console.log(`[room] created ${code}`);}
function joinRoom(ws,code,nickname){const room=rooms.get(code);if(!room)return send(ws,'ERROR',{message:'房间不存在'});if(room.players.B)return send(ws,'ERROR',{message:'房间已满'});if(room.players.A.nickname===nickname)return send(ws,'ERROR',{message:'昵称已被使用'});const session=token();room.players.B={nickname,ready:true,ws,session,continueReady:false,lineupReady:false};ws.room=code;ws.side='B';send(ws,'SESSION',{code,side:'B',token:session});broadcast(room);console.log(`[room] joined ${code}`);setTimeout(()=>{if(room.status==='lobby'&&room.players.A?.ready&&room.players.B?.ready)startMatch(room);},3000);}
function reconnect(ws,code,session){const room=rooms.get(code);if(!room)return send(ws,'ERROR',{message:'房间已过期'});const side=['A','B'].find(s=>room.players[s]?.session===session);if(!side)return send(ws,'ERROR',{message:'重连令牌无效'});room.players[side].ws=ws;clearTimeout(room.players[side].disconnectTimer);ws.room=code;ws.side=side;send(ws,'SESSION',{code,side,token:session,reconnected:true});broadcast(room);console.log(`[room] reconnected ${code} ${side}`);}
function onMessage(ws,raw){if(raw.length>4096)return send(ws,'ERROR',{message:'消息过长'});let msg;try{msg=JSON.parse(raw);}catch{return send(ws,'ERROR',{message:'消息格式错误'});}if(msg.protocol!==PROTOCOL)return send(ws,'ERROR',{message:'协议版本不一致，请刷新页面'});if(limited(`${ws._socket.remoteAddress}:${msg.type}`))return send(ws,'ERROR',{message:'操作过于频繁'});const p=msg.payload||{};if(msg.type==='CREATE'){if(!validName(p.nickname))return send(ws,'ERROR',{message:'昵称需为2-16个中英文、数字或下划线'});return createRoom(ws,p.nickname);}if(msg.type==='JOIN'){if(!validName(p.nickname)||!/^[0-9]{6}$/.test(p.code))return send(ws,'ERROR',{message:'昵称或房间码无效'});return joinRoom(ws,p.code,p.nickname);}if(msg.type==='RECONNECT')return reconnect(ws,p.code,p.token);const room=rooms.get(ws.room),side=ws.side;if(!room||!side)return send(ws,'ERROR',{message:'尚未加入房间'});if(msg.type==='READY'){room.players[side].ready=!!p.ready;if(room.players.A?.ready&&room.players.B?.ready)setTimeout(()=>startMatch(room),3000);broadcast(room);}else if(msg.type==='ORDER'){if(handleOrder(room,side,p.choice))broadcast(room);else send(ws,'ERROR',{message:'当前不能选择顺位'});}else if(msg.type==='ACTION'){if(handleAction(room,side,p.action,p.playerId))broadcast(room);else send(ws,'ERROR',{message:'非法禁选操作'});}else if(msg.type==='CONTINUE'||msg.type==='NEXT'){advance(room,side);}else if(msg.type==='SWAP'){lineupSwap(room,side,p.a,p.b);broadcast(room);}else if(msg.type==='LINEUP_READY'){room.players[side].lineupReady=true;finishLineupIfReady(room);broadcast(room);}else if(msg.type==='FORFEIT'){finishByForfeit(room,side,'主动认输');}else if(msg.type==='CHAT'){if(Date.now()-(room.players[side].lastChat||0)<3000)return;const allowed=['你好','准备好了吗','我要拿前锋','别抢我的人','打得不错','再来一局','赞','惊讶','足球'];if(!allowed.includes(p.message))return;room.players[side].lastChat=Date.now();room.chat.push({side,message:p.message,at:Date.now()});broadcast(room);}else if(msg.type==='REMATCH'){room.rematch[side]=true;if(room.rematch.A&&room.rematch.B){room.players.A.ready=true;room.players.B.ready=true;room.rematch={A:false,B:false};startMatch(room);}broadcast(room);}else if(msg.type==='GET_HISTORY'){if(room.players[side].session===p.token)send(ws,'HISTORY',{history:room.history,game:room.game,forfeit:room.forfeit});}}

const server=http.createServer(async(req,res)=>{
  try{
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
    
    const url = new URL(req.url,'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    
    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/api/room/create') {
      const code = roomCode();
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code }));
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
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  }catch(err){
    console.error('[http] error:', err.message);
    res.writeHead(404);
    res.end('Not found');
  }
});
const wss=new WebSocketServer({server,path:'/ws'});
wss.on('connection',(ws,req)=>{
  const origin=req.headers.origin||'';
  const ip = getClientIP(req);
  
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes('*') && !ALLOWED_ORIGINS.includes(origin)) {
    console.log(`[socket] rejected origin: ${origin} from ${ip}`);
    ws.close(1008,'Origin rejected');
    return;
  }
  
  console.log(`[socket] connected ${ip} origin:${origin || 'none'}`);
  
  ws.on('message',data=>onMessage(ws,data.toString()));
  ws.on('close',()=>{
    const room=rooms.get(ws.room),p=room?.players[ws.side];
    if(!p)return;
    p.ws=null;
    p.disconnectTimer=setTimeout(()=>{
      finishByForfeit(room,ws.side,'断线超过90秒');
    },90000);
    broadcast(room);
    console.log(`[socket] disconnected ${ws.room||''} ${ws.side||''}`);
  });
  ws.on('error',(err)=>console.error(`[socket] error ${ws.room||''} ${ws.side||''}:`,err.message));
});
setInterval(()=>{const now=Date.now();for(const [code,room]of rooms){if(room.status==='lobby'&&now-room.createdAt>600000){clearTimeout(room.timer);rooms.delete(code);}else if(room.status==='finished'&&now-room.finishedAt>300000){clearTimeout(room.timer);rooms.delete(code);}}for(const [key,times]of rate)if(!times.some(t=>now-t<10000))rate.delete(key);},30000);

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const localIP = getLocalIP();
const lanUrl = localIP ? `http://${localIP}:${PORT}` : null;

server.listen(PORT,'0.0.0.0',()=>{
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  🏟️  绿茵禁选对决 - 服务器已启动`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  本机访问:  http://localhost:${PORT}`);
  if (lanUrl) {
    console.log(`  局域网:    ${lanUrl}`);
    console.log(`  (在同一网络下的设备可使用此地址)`);
  }
  console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  在线对战:  创建房间后发送6位房间码给好友`);
  console.log(`  或直接发送完整邀请链接给好友`);
  console.log(`${'='.repeat(50)}\n`);
});

export { server, rooms, onMessage };
