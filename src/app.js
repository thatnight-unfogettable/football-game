import { PLAYER_DATA } from '../data/players.js';
import { OnlineClient } from './online.js';

const app = document.querySelector('#app');
const ACTIVE_KEY = 'football-bp-active-v1';
const HISTORY_KEY = 'football-bp-history-v1';
const RULE_VERSION = 1;
const ROUND_TYPES = ['FWD', 'DEF', 'MID', 'DEF', 'MID', 'FWD', 'DEF', 'MID', 'DEF', 'FWD'];
const ROUND_HINTS = ['中锋', '边后卫', '组织中场', '中卫', '防守中场', '边锋', '中卫', '全能中场', '边后卫', '边锋'];
const SLOT_ORDER = ['LW', 'ST', 'RW', 'CM1', 'CDM', 'CM2', 'LB', 'CB1', 'CB2', 'RB', 'GK'];
const SLOT_LABELS = { LW: '左边锋', ST: '中锋', RW: '右边锋', CM1: '中前卫', CDM: '后腰', CM2: '中前卫', LB: '左后卫', CB1: '中卫', CB2: '中卫', RB: '右后卫', GK: '门将' };
const POSITION_NAME = { FWD: '前锋', MID: '中场', DEF: '后卫', GK: '门将' };
const NAME_ZH = {
  'Kylian Mbappé':'基利安·姆巴佩','Rodri':'罗德里','Erling Haaland':'埃尔林·哈兰德','Jude Bellingham':'裘德·贝林厄姆','Vinícius Júnior':'维尼修斯·儒尼奥尔','Harry Kane':'哈里·凯恩','Kevin De Bruyne':'凯文·德布劳内','Mohamed Salah':'穆罕默德·萨拉赫','Lautaro Martínez':'劳塔罗·马丁内斯','Robert Lewandowski':'罗伯特·莱万多夫斯基','Virgil van Dijk':'维吉尔·范戴克','Thibaut Courtois':'蒂博·库尔图瓦','Alisson':'阿利松','Ederson':'埃德森','Rúben Dias':'鲁本·迪亚斯','Antonio Rüdiger':'安东尼奥·吕迪格','William Saliba':'威廉·萨利巴','Federico Valverde':'费德里科·巴尔韦德','Martin Ødegaard':'马丁·厄德高','Bruno Fernandes':'布鲁诺·费尔南德斯','Bernardo Silva':'贝尔纳多·席尔瓦','Bukayo Saka':'布卡约·萨卡','Phil Foden':'菲尔·福登','Jamal Musiala':'贾马尔·穆西亚拉','Florian Wirtz':'弗洛里安·维尔茨','Pedri':'佩德里','Gavi':'加维','Rodrygo':'罗德里戈','Antoine Griezmann':'安托万·格列兹曼','Victor Osimhen':'维克托·奥斯梅恩','Son Heung Min':'孙兴慜','Cristiano Ronaldo':'克里斯蒂亚诺·罗纳尔多','Lionel Messi':'利昂内尔·梅西','Neymar Jr':'内马尔','Declan Rice':'德克兰·赖斯','Joshua Kimmich':'约书亚·基米希','Achraf Hakimi':'阿什拉夫·哈基米','Theo Hernández':'特奥·埃尔南德斯','Mike Maignan':'迈克·迈尼昂','Gianluigi Donnarumma':'詹路易吉·多纳鲁马','Marc-André ter Stegen':'马克-安德烈·特尔施特根','Jan Oblak':'扬·奥布拉克','Marquinhos':'马尔基尼奥斯','Éder Militão':'埃德尔·米利唐','Ronald Araújo':'罗纳德·阿劳霍','João Cancelo':'若昂·坎塞洛','Trent Alexander-Arnold':'特伦特·亚历山大-阿诺德','Andrew Robertson':'安德鲁·罗伯逊','Alphonso Davies':'阿方索·戴维斯','Frenkie de Jong':'弗兰基·德容','İlkay Gündoğan':'伊尔卡伊·京多安','Nicolò Barella':'尼科洛·巴雷拉','Hakan Çalhanoğlu':'哈坎·恰尔汗奥卢','Toni Kroos':'托尼·克罗斯','Luka Modrić':'卢卡·莫德里奇','Aurélien Tchouaméni':'奥雷利安·楚阿梅尼','Eduardo Camavinga':'爱德华多·卡马文加','Rafael Leão':'拉斐尔·莱奥','Ousmane Dembélé':'奥斯曼·登贝莱','Khvicha Kvaratskhelia':'赫维恰·克瓦拉茨赫利亚','Julián Álvarez':'胡利安·阿尔瓦雷斯','Alexander Isak':'亚历山大·伊萨克','Darwin Núñez':'达尔文·努涅斯','Kai Havertz':'凯·哈弗茨','Gabriel Martinelli':'加布里埃尔·马丁内利','Cole Palmer':'科尔·帕尔默','Luis Díaz':'路易斯·迪亚斯','Leroy Sané':'勒鲁瓦·萨内'
};
const COURTOIS = { id: 'shared_courtois', name: '蒂博·库尔图瓦', englishName: 'Thibaut Courtois', rating: 90, position: 'GK', detailedPosition: 'GK', alternativePositions: [], club: '固定门将', league: '特殊卡', country: '比利时', grade: 'S' };
let game = null;
let selectedId = null;
let aiTimer = null;
let audioContext = null;
let online = { client: null, state: null, nickname: localStorage.getItem('football-bp-nickname') || '', error: '', invite: '' };

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
function normalizePlayers() {
  return PLAYER_DATA.map(p => ({ ...p, englishName:p.englishName || p.name, name:nameZh(p), alternativePositions:p.alternativePositions || inferAlternatives(p.detailedPosition), club:p.club || '未知俱乐部', league:p.league || '未知联赛', country:p.country || '未知国籍' }));
}
function inferAlternatives(pos) {
  const map = { ST:['CF'], CF:['ST','CAM'], LW:['LM','RW'], RW:['RM','LW'], LM:['LW','CM'], RM:['RW','CM'], CAM:['CM','CF'], CM:['CAM','CDM'], CDM:['CM','CB'], LB:['LWB','CB'], RB:['RWB','CB'], LWB:['LB','LM'], RWB:['RB','RM'], CB:['LB','RB','CDM'], GK:[] };
  return map[pos] || [];
}
function generateRounds() {
  const needs = { FWD:36, MID:36, DEF:48 };
  const groups = {};
  for (const [position, count] of Object.entries(needs)) {
    const top = game.players.filter(p => p.position === position).sort((a,b) => b.rating - a.rating).slice(0, count);
    const tierSize = Math.ceil(top.length / 4);
    groups[position] = Array.from({length:4}, (_,i) => shuffle(top.slice(i*tierSize, (i+1)*tierSize)));
  }
  const rounds = [];
  for (const position of ROUND_TYPES) {
    const cards = [];
    for (const tier of groups[position]) cards.push(...tier.splice(0, Math.min(3, tier.length)));
    while (cards.length < 12) { const tier = groups[position].find(t => t.length); if (!tier) break; cards.push(tier.shift()); }
    rounds.push(shuffle(cards).map(p => p.id));
  }
  return rounds;
}
function newGame(settings) {
  const seedText = `${Date.now()}-${Math.random()}-${settings.difficulty}-${settings.personality}`;
  game = { version:RULE_VERSION, screen:'order', phase:'order', seed:seedText, rng:hashSeed(seedText), settings, players:normalizePlayers(), rounds:[], round:0, banTurn:0, firstBan:'PLAYER', selected:null, candidates:[], bans:{PLAYER:[],AI:[]}, roundBans:[], picks:{PLAYER:[COURTOIS.id],AI:[COURTOIS.id]}, roundPicks:[], log:[], snapshots:[], lineup:{PLAYER:null,AI:null}, result:null };
  game.rounds = generateRounds();
  snapshot('对局开始'); save(); render();
}
function snapshot(label) { game.snapshots.push({ label, round:game.round, phase:game.phase, bans:clone(game.bans), picks:clone(game.picks), candidates:clone(game.candidates), log:clone(game.log) }); }
function beginRound(order) {
  game.firstBan = order; game.candidates = [...game.rounds[game.round]]; game.roundBans = []; game.roundPicks = []; game.banTurn = 0; game.phase = 'ban'; selectedId = null;
  game.log.push({ type:'round', round:game.round+1, position:ROUND_TYPES[game.round], candidates:[...game.candidates], firstBan:order });
  snapshot(`第${game.round+1}轮候选揭晓`); save(); render(); scheduleAI();
}
function actorForBan() { return game.banTurn % 2 === 0 ? game.firstBan : (game.firstBan === 'PLAYER' ? 'AI' : 'PLAYER'); }
function currentActor() {
  if (game.phase === 'ban') return actorForBan();
  if (game.phase === 'pick') { const lastBanner = game.roundBans[5]?.actor; return game.roundPicks.length === 0 ? lastBanner : (lastBanner === 'PLAYER' ? 'AI' : 'PLAYER'); }
  return null;
}
function available() { const removed = new Set([...game.roundBans.map(x=>x.id), ...game.roundPicks.map(x=>x.id)]); return game.candidates.filter(id => !removed.has(id)); }
function confirmPlayerAction() {
  if (!selectedId || currentActor() !== 'PLAYER') return;
  if (game.phase === 'ban') applyBan('PLAYER', selectedId, '玩家决策'); else applyPick('PLAYER', selectedId, '玩家选择');
}
function applyBan(actor, id, reason) {
  if (!available().includes(id) || game.phase !== 'ban') return;
  game.roundBans.push({ actor,id,reason }); game.bans[actor].push(id); game.log.push({ type:'ban',round:game.round+1,actor,id,reason }); game.banTurn++; selectedId=null; beep('ban'); snapshot(`${actor==='PLAYER'?'玩家':'AI'}禁用${nameZh(player(id))}`);
  if (game.banTurn >= 6) game.phase='pick'; save(); render(); scheduleAI();
}
function applyPick(actor, id, reason) {
  if (!available().includes(id) || game.phase !== 'pick') return;
  game.roundPicks.push({actor,id,reason}); game.picks[actor].push(id); game.log.push({type:'pick',round:game.round+1,actor,id,reason}); selectedId=null; beep('select'); snapshot(`${actor==='PLAYER'?'玩家':'AI'}选择${nameZh(player(id))}`);
  if (game.roundPicks.length >= 2) { game.phase='summary'; save(); render(); } else { save(); render(); scheduleAI(); }
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
  const ids=available(); const difficulty=game.settings.difficulty; const mistake={easy:.30,normal:.15,hard:.05}[difficulty];
  if (rng()<mistake) return ids[Math.floor(rng()*ids.length)];
  const scored=ids.map(id=>({id,score:candidateThreat(id,'AI',action)})).sort((a,b)=>b.score-a.score);
  if (difficulty==='hard') return scored.slice(0,Math.min(5,scored.length)).map((x,i)=>({...x,score:x.score+(5-i)*.15})).sort((a,b)=>b.score-a.score)[0].id;
  return scored[0].id;
}
function scheduleAI() {
  clearTimeout(aiTimer); if (currentActor()!=='AI') return;
  aiTimer=setTimeout(()=>{ const action=game.phase; const id=aiChoice(action); const p=player(id); const reason=action==='ban'?(p.rating>=88?'高评分威胁':game.settings.personality==='counter'?'阻断你的组合':'控制候选池'):(p.rating>=88?'纸面核心':game.settings.personality==='chemistry'?'增强化学反应':'提升综合实力'); if(action==='ban')applyBan('AI',id,reason);else applyPick('AI',id,reason); }, {fast:250,normal:750,slow:1400}[game.settings.speed]);
}
function continueRound() { if (game.round >= 9) { finalizeLineups(); return; } game.round++; game.phase='order'; game.screen='order'; save(); render(); }
function roleFit(p, slot) {
  if (slot==='GK') return p.position==='GK'?1:0;
  const target = slot.replace(/[12]/g,''); const pos=p.detailedPosition || p.position; const alt=p.alternativePositions||[];
  if(pos===target) return 1; if(alt.includes(target)) return .96;
  const near={LW:['RW','LM','ST','CF'],RW:['LW','RM','ST','CF'],ST:['CF','LW','RW'],CM:['CAM','CDM','LM','RM'],CDM:['CM','CB'],LB:['LWB','CB'],RB:['RWB','CB'],CB:['LB','RB','CDM']}[target]||[];
  return near.includes(pos) ? .96 : .92;
}
function bestAssignment(ids) {
  const cards=ids.map(player); const slots=SLOT_ORDER.filter(s=>s!=='GK'); const byLine={FWD:slots.slice(0,3),MID:slots.slice(3,6),DEF:slots.slice(6,10)}; const result={GK:COURTOIS.id};
  for(const [line,lineSlots] of Object.entries(byLine)) {
    const pool=cards.filter(p=>p.position===line); const remaining=[...pool];
    for(const slot of lineSlots) { let best=remaining.map((p,i)=>({i,v:p.rating*roleFit(p,slot)})).sort((a,b)=>b.v-a.v)[0]; const [picked]=remaining.splice(best.i,1); result[slot]=picked.id; }
  }
  return result;
}
function lineupMetrics(assignment) {
  const entries=SLOT_ORDER.map(slot=>({slot,p:player(assignment[slot]),fit:roleFit(player(assignment[slot]),slot)}));
  const lineAverage=line=>{const rows=entries.filter(x=>x.p.position===line);return rows.reduce((s,x)=>s+x.p.rating*x.fit,0)/rows.length;};
  const paper=lineAverage('GK')*.1+lineAverage('DEF')*.3+lineAverage('MID')*.3+lineAverage('FWD')*.3;
  const nonGk=entries.filter(x=>x.slot!=='GK'); const slotFit=nonGk.reduce((s,x)=>s+x.fit,0)/10*32;
  const roles={FWD:['LW','ST','RW'],MID:['CM1','CDM','CM2'],DEF:['LB','CB1','CB2','RB']}; let template=0;
  Object.values(roles).forEach(slots=>{if(slots.every(slot=>roleFit(player(assignment[slot]),slot)>=.96))template+=8/3;});
  const groupScore=(field,thresholds,cap)=>{const counts={};nonGk.forEach(x=>counts[x.p[field]]=(counts[x.p[field]]||0)+1);let total=0;Object.values(counts).forEach(n=>{let best=0;thresholds.forEach(([need,score])=>{if(n>=need)best=score;});total+=best;});return Math.min(cap,total);};
  const club=groupScore('club',[[2,4],[3,8],[4,12]],20), league=groupScore('league',[[2,3],[4,7],[6,11]],15), nation=groupScore('country',[[2,3],[3,6],[5,10]],15);
  const ratings=nonGk.map(x=>x.p.rating); const leaders=Math.min(6,ratings.filter(r=>r>=85).length*2); const gap=Math.max(...ratings)-Math.min(...ratings); const balance=gap<=8?4:gap<=12?3:gap<=16?2:gap<=20?1:0;
  const chemistry=Math.min(100,slotFit+template+club+league+nation+leaders+balance); const overall=paper*.7+chemistry*.3;
  return {paper,chemistry,overall,lines:{FWD:lineAverage('FWD'),MID:lineAverage('MID'),DEF:lineAverage('DEF'),GK:90},parts:{slotFit,template,club,league,nation,grade:leaders+balance}};
}
function finalizeLineups() { game.lineup.PLAYER=bestAssignment(game.picks.PLAYER); game.lineup.AI=bestAssignment(game.picks.AI); game.phase='lineup'; game.screen='lineup'; snapshot('阵容自动排布'); save(); render(); }
function swapSlots(a,b) { if(a==='GK'||b==='GK')return; [game.lineup.PLAYER[a],game.lineup.PLAYER[b]]=[game.lineup.PLAYER[b],game.lineup.PLAYER[a]]; selectedId=null; save(); render(); }
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

function card(id,{disabled=false,selected=false,clickable=true}={}) { const p=player(id); const threat=game?.phase==='ban'&&game.picks.PLAYER.length>1?`化学预估 +${Math.max(0,Math.round(candidateThreat(id,'PLAYER','pick')-p.rating))}～+${Math.max(2,Math.round(candidateThreat(id,'PLAYER','pick')-p.rating)+3)}`:''; return `<button class="player-card grade-${p.grade} ${disabled?'disabled':''} ${selected?'selected':''}" data-card="${id}" ${disabled||!clickable?'disabled':''}><span class="card-grade">${p.grade}</span><b class="card-rating">${p.rating}</b><span class="avatar">${esc(nameZh(p).slice(0,1))}</span><strong>${esc(nameZh(p))}</strong><small>${esc(p.englishName)}</small><div>${esc(p.club)} · ${esc(p.league)}</div><div>${esc(p.country)} · ${esc(p.detailedPosition||p.position)}</div>${threat?`<em>${threat}</em>`:''}</button>`; }
function roster(side) { const picks=game.picks[side]; return `<aside class="roster ${side.toLowerCase()}"><h3>${side==='PLAYER'?'你的阵容':'AI阵容'}</h3><div class="roster-score">当前纸面 ${currentPaper(side).toFixed(1)}</div><div class="mini-slots"><div class="mini-player fixed">GK ${COURTOIS.name} · 90</div>${picks.filter(id=>id!==COURTOIS.id).map(id=>`<div class="mini-player">${POSITION_NAME[player(id).position]} ${esc(nameZh(player(id)))} <b>${player(id).rating}</b></div>`).join('')}${Array(Math.max(0,10-(picks.length-1))).fill('<div class="mini-player empty">待选择</div>').join('')}</div></aside>`; }
function currentPaper(side) { const cards=game.picks[side].map(player); if(cards.length===1)return 90; return cards.reduce((s,p)=>s+p.rating,0)/cards.length; }
function bansPanel() { const row=side=>`<div class="ban-row"><b>${side==='PLAYER'?'玩家禁用':'AI禁用'}</b>${game.bans[side].slice(-3).map((id,i)=>`<span>${i+1}. ${esc(nameZh(player(id)))}</span>`).join('')||'<span>暂无</span>'}</div>`; return `<section class="ban-panel">${row('PLAYER')}${row('AI')}</section>`; }
function header() { return `<header class="app-header"><div class="logo">DRAFT<span>XI</span></div><div class="round-meta">第 ${Math.min(game.round+1,10)} / 10 轮 · ${POSITION_NAME[ROUND_TYPES[game.round]]||'结算'} <small>${ROUND_HINTS[game.round]||''}</small></div><button class="ghost" data-home>退出</button></header>`; }
function menu() { const active=localStorage.getItem(ACTIVE_KEY); return `<div class="landing"><div class="landing-copy"><span class="kicker">BAN · PICK · BUILD</span><h1>禁掉威胁<br><em>选出你的最强十一人</em></h1><p>十轮足球BP。每轮12人、六次禁用、双方各取一人。纸面实力与化学反应共同决定三局两胜。</p><div class="menu-actions"><button class="primary" data-new>开始人机对战</button><button class="accent" data-online>好友在线对战</button>${active?'<button data-resume>继续未完成对局</button>':''}<button data-history>最近20局</button><a href="legacy/index.html">旧经营模式</a></div></div><div class="hero-board"><div class="versus"><span>YOU</span><b>VS</b><span>AI / 好友</span></div><div class="rule-cards"><article><b>12</b><span>每轮候选</span></article><article><b>6</b><span>交替禁用</span></article><article><b>11</b><span>最终阵容</span></article></div></div></div>`; }
function onlineLobby() { 
  const roomFromUrl=new URLSearchParams(location.search).get('room')||'';
  const serverUrl = location.origin;
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
        <p>当前服务器: <code>${esc(serverUrl)}</code></p>
        <p class="server-tip">确保好友也能访问此服务器地址</p>
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
function setup() { return `<div class="setup-page"><section><span class="kicker">MATCH SETTINGS</span><h1>创建人机对局</h1><label>AI难度<select id="difficulty"><option value="easy">简单 · 30%失误</option><option value="normal" selected>普通 · 15%失误</option><option value="hard">困难 · 五步评估</option></select></label><label>AI性格<select id="personality"><option value="power">实力型</option><option value="chemistry">化学反应型</option><option value="counter">针对型</option></select></label><label>动画速度<select id="speed"><option value="fast">快速</option><option value="normal" selected>正常</option><option value="slow">慢速</option></select></label><label class="check"><input id="audio" type="checkbox" checked> 开启基础音效</label><button class="primary" data-start>进入BP</button><button data-cancel>返回</button></section><aside><h2>固定规则</h2><p>4-3-3 · 双方固定90分库尔图瓦</p><p>纸面实力70% + 化学反应30%</p><p>玩家每轮自由选择先禁或后禁</p><p>后禁方执行第6禁并获得先选权</p></aside></div>`; }
function orderScreen() { return `<div class="game">${header()}<main class="order-choice"><span class="kicker">ROUND ${game.round+1}</span><h1>${POSITION_NAME[ROUND_TYPES[game.round]]}轮 · 推荐${ROUND_HINTS[game.round]}</h1><p>先禁方拥有第1、3、5禁；后禁方拥有第2、4、6禁，并在禁满6人后先选。</p><div class="choice-grid"><button data-order="PLAYER"><b>我要先禁</b><span>优先封锁最危险球员</span></button><button class="accent" data-order="AI"><b>我要后禁</b><span>执行第6禁并获得先选权</span></button></div><div class="fixed-gk">双方门将已锁定：蒂博·库尔图瓦 · 90</div></main></div>`; }
function bpScreen() { const actor=currentActor(); const removed=new Set([...game.roundBans.map(x=>x.id),...game.roundPicks.map(x=>x.id)]); const action=game.phase==='ban'?'禁用':'选择'; return `<div class="game">${header()}<div class="bp-layout">${roster('PLAYER')}<main class="board"><div class="turn-banner ${actor?.toLowerCase()}"><b>${actor==='PLAYER'?'你的回合':'AI思考中'}</b><span>${game.phase==='ban'?`第${game.banTurn+1}/6禁用`:`第${game.roundPicks.length+1}/2选择`} · ${action}一名${POSITION_NAME[ROUND_TYPES[game.round]]}</span></div>${bansPanel()}<div class="candidate-grid">${game.candidates.map(id=>card(id,{disabled:removed.has(id),selected:selectedId===id,clickable:actor==='PLAYER'})).join('')}</div><footer><span>${selectedId?`已选中：${esc(nameZh(player(selectedId)))}`:'先查看卡牌信息，再确认操作'}</span><button class="primary" data-confirm ${!selectedId||actor!=='PLAYER'?'disabled':''}>确认${action}</button></footer></main>${roster('AI')}</div></div>`; }
function summaryScreen() { const pp=game.roundPicks.find(x=>x.actor==='PLAYER'),ap=game.roundPicks.find(x=>x.actor==='AI'); return `<div class="game">${header()}<main class="round-summary"><span class="kicker">ROUND COMPLETE</span><h1>第${game.round+1}轮选人完成</h1><div class="duel-picks"><article>${card(pp.id,{clickable:false})}<h3>你的选择</h3></article><b>VS</b><article>${card(ap.id,{clickable:false})}<h3>AI选择</h3></article></div><div class="summary-stats"><span>你的纸面 ${currentPaper('PLAYER').toFixed(1)}</span><span>AI纸面 ${currentPaper('AI').toFixed(1)}</span><span>下一轮 ${game.round<9?POSITION_NAME[ROUND_TYPES[game.round+1]]:'阵容排布'}</span></div><button class="primary" data-next>${game.round<9?'进入下一轮':'进入阵容调整'}</button></main></div>`; }
function pitch(side,editable=false) { const assignment=game.lineup[side]; return `<div class="pitch">${SLOT_ORDER.map(slot=>{const p=player(assignment[slot]);return `<button class="pitch-slot slot-${slot.toLowerCase()} ${selectedId===slot?'selected':''}" data-slot="${slot}" ${!editable||slot==='GK'?'disabled':''}><small>${SLOT_LABELS[slot]}</small><b>${esc(nameZh(p))}</b><span>${p.rating} · 适配${Math.round(roleFit(p,slot)*100)}%</span></button>`;}).join('')}</div>`; }
function metricPanel(side) { const m=lineupMetrics(game.lineup[side]); return `<div class="metric-panel"><div><span>纸面实力</span><b>${m.paper.toFixed(1)}</b></div><div><span>化学反应</span><b>${m.chemistry.toFixed(1)}</b></div><div class="overall"><span>综合实力</span><b>${m.overall.toFixed(1)}</b></div><small>前锋 ${m.lines.FWD.toFixed(1)} · 中场 ${m.lines.MID.toFixed(1)} · 后卫 ${m.lines.DEF.toFixed(1)}</small></div>`; }
function lineupScreen() { return `<div class="game">${header()}<main class="lineup-page"><div class="section-title"><div><span class="kicker">FINAL LINEUP</span><h1>调整你的4-3-3</h1><p>点击两个非门将槽位即可交换球员。AI阵容已完成独立最优排布。</p></div><button class="primary" data-play>确认阵容并开始三局两胜</button></div><div class="lineup-compare"><section><h2>玩家阵容</h2>${pitch('PLAYER',true)}${metricPanel('PLAYER')}</section><section><h2>AI阵容</h2>${pitch('AI')}${metricPanel('AI')}</section></div></main></div>`; }
function resultScreen() { const r=game.result,win=r.winner==='PLAYER'; return `<div class="game result-page">${header()}<main><span class="kicker">BEST OF THREE</span><h1>${win?'你赢得了对局':'AI赢得了对局'}</h1><div class="series-score"><b>${r.pw}</b><span>:</span><b>${r.aw}</b></div><div class="matches">${r.matches.map((m,i)=>`<article><small>第${i+1}场 · ${m.venue}</small><strong>${m.pg} : ${m.ag}</strong></article>`).join('')}</div><div class="result-metrics">${metricPanel('PLAYER')}${metricPanel('AI')}</div><div class="mvp">本局MVP <strong>${esc(nameZh(player(r.mvp)))}</strong></div><div class="menu-actions"><button class="primary" data-rematch>再来一局</button><button data-lineups>查看阵容</button><button data-replay>查看BP回放</button><button data-home>返回主菜单</button></div></main></div>`; }
function historyScreen() { const list=histories(); return `<div class="history-page"><header><h1>最近20局</h1><button data-home>返回</button></header>${list.length?list.map((r,i)=>`<article><div><b>${r.winner==='PLAYER'?'胜利':'失败'} ${r.pw}:${r.aw}</b><span>${new Date(r.date).toLocaleString()}</span></div><div>玩家 ${r.metrics.PLAYER.overall.toFixed(1)} · AI ${r.metrics.AI.overall.toFixed(1)}</div><button data-history-replay="${i}">逐步回放</button></article>`).join(''):'<p class="empty">暂无完成的对局</p>'}</div>`; }
function replayScreen() { const record=game.replayRecord, step=game.replayStep||0, snap=record.snapshots[step]; return `<div class="replay-page"><header><h1>BP逐步回放</h1><button data-home>返回</button></header><div class="replay-progress">${step+1} / ${record.snapshots.length} · ${esc(snap.label)}</div><div class="replay-columns"><section><h2>玩家阵容</h2>${snap.picks.PLAYER.map(id=>`<p>${esc(id==='shared_courtois'?'蒂博·库尔图瓦':nameZh(record.players.find(p=>p.id===id)||{name:id}))}</p>`).join('')}</section><section><h2>当轮候选</h2>${snap.candidates.map(id=>`<span>${esc(nameZh(record.players.find(p=>p.id===id)||{name:id}))}</span>`).join('')}</section><section><h2>AI阵容</h2>${snap.picks.AI.map(id=>`<p>${esc(id==='shared_courtois'?'蒂博·库尔图瓦':nameZh(record.players.find(p=>p.id===id)||{name:id}))}</p>`).join('')}</section></div><div class="replay-controls"><button data-step="-1" ${step===0?'disabled':''}>上一步</button><button data-step="1" ${step>=record.snapshots.length-1?'disabled':''}>下一步</button></div></div>`; }
function onlineSideLabel(side){const p=online.room?.players.find(x=>x.side===side);return p?.nickname||side;}
function onlinePlayer(id){return id===COURTOIS.id?COURTOIS:PLAYER_DATA.find(p=>p.id===id);}
function onlineActor(match){if(match.phase==='ORDER')return match.choiceSide;if(match.phase==='BAN')return match.banTurn%2===0?match.firstBan:(match.firstBan==='HOST'?'GUEST':'HOST');if(match.phase==='PICK'){const first=match.roundBans[5]?.side;return match.roundPicks.length===0?first:(first==='HOST'?'GUEST':'HOST');}return null;}
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
      online.state = state;
      game={screen:'online-room'};
      render();
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
      <div class="player-status ${you === 'A' ? 'you' : 'waiting'}">
        <span class="status-dot"></span>
        <span class="player-name">${esc(players.A?.nickname || '房主')}</span>
        <span class="player-role">房主</span>
      </div>
      ${players.B ? `
        <div class="player-status connected">
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
    const bannedIds = m.bans.map(b => b.playerId);
    const pickedIds = [...(m.picks.A || []), ...(m.picks.B || [])];
    const used = new Set([...bannedIds, ...pickedIds]);
    return m.candidates.filter(id => !used.has(id));
  })();
  
  const cards = m.candidates.map(id => {
    const p = onlinePlayer(id);
    const unavailable = !availableIds.includes(id);
    return `<button class="player-card grade-${p.grade||'B'} ${unavailable?'disabled':''} ${selectedId===id?'selected':''}" data-online-card="${id}" ${unavailable?'disabled':''}>
      <span class="card-grade">${p.grade||'B'}</span>
      <b class="card-rating">${p.rating}</b>
      <span class="avatar">${esc(nameZh(p).slice(0,1))}</span>
      <strong>${esc(nameZh(p))}</strong>
      <small>${esc(p.englishName||'')}</small>
      <div>${esc(p.club||'')} · ${esc(p.league||'')}</div>
    </button>`;
  }).join('');
  
  const deadline = m.deadline ? Math.max(0, Math.ceil((m.deadline - Date.now()) / 1000)) : 0;
  const choiceOwner = state.choiceOwner;
  const isYourTurn = choiceOwner === you;
  
  const rosterOnline = (side) => `<aside class="roster ${side.toLowerCase()}">
    <h3>${side === 'A' ? (players.A?.nickname || '玩家A') : (players.B?.nickname || '玩家B')}</h3>
    <div class="mini-slots">
      <div class="mini-player fixed">GK 库尔图瓦 · 90</div>
      ${m.picks[side].filter(id => id !== COURTOIS.id).map(id => {
        const p = onlinePlayer(id);
        return `<div class="mini-player">${esc(nameZh(p))}<b>${p.rating}</b></div>`;
      }).join('')}
    </div>
  </aside>`;
  
  return `<div class="game">
    <header class="app-header">
      <div class="logo">ONLINE<span>XI</span></div>
      <div class="round-meta">房间 ${room.code} · 第${Math.min(m.round+1,10)}轮<small>${m.phase} · ${deadline}秒</small></div>
      <button data-online-leave>退出</button>
    </header>
    <div class="online-status">
      <span class="${players.A?.connected?'connected':'disconnected'}">${players.A?.nickname || '玩家A'} · ${players.A?.connected?'在线':'掉线'}</span>
      <span class="${players.B?.connected?'connected':'disconnected'}">${players.B?.nickname || '玩家B'} · ${players.B?.connected?'在线':'掉线'}</span>
    </div>
    <div class="bp-layout">
      ${rosterOnline('A')}
      <main class="board">
        <div class="turn-banner ${isYourTurn?'player':'ai'}">
          <b>${isYourTurn?'你的回合':'等待对方'}</b>
          <span>${m.phase==='ORDER'?'决定本轮先后手':m.phase==='BAN'?`第${m.banTurn+1}/6禁用`:m.phase==='PICK'?'选择球员':'进行中'}</span>
        </div>
        ${m.phase==='ORDER'&&isYourTurn?`<div class="choice-grid online-choice">
          <button data-online-order="first">我先禁</button>
          <button class="accent" data-online-order="last">我后禁</button>
        </div>`:''}
        <div class="candidate-grid">${cards}</div>
        ${['BAN','PICK'].includes(m.phase)&&isYourTurn?`<footer>
          <span>${selectedId ? esc(nameZh(onlinePlayer(selectedId))) : '请选择球员'}</span>
          <button class="primary" data-online-confirm ${!selectedId?'disabled':''}>确认${m.phase==='BAN'?'禁用':'选择'}</button>
        </footer>`:''}
      </main>
      ${rosterOnline('B')}
    </div>
  </div>`;
}
function render() {
  clearTimeout(aiTimer);
  if(!game){app.innerHTML=menu();bind();return;}
  const html=game.screen==='online-lobby'?onlineLobby():game.screen==='online-room'?onlineRoom():game.screen==='setup'?setup():game.screen==='history'?historyScreen():game.screen==='replay'?replayScreen():game.phase==='order'?orderScreen():['ban','pick'].includes(game.phase)?bpScreen():game.phase==='summary'?summaryScreen():game.phase==='lineup'?lineupScreen():game.phase==='result'?resultScreen():menu(); app.innerHTML=html; bind(); if(game.screen!=='online-room')scheduleAI();
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
  document.querySelector('[data-resume]')?.addEventListener('click',()=>{try{game=JSON.parse(localStorage.getItem(ACTIVE_KEY));render();}catch{reset();}});
  document.querySelector('[data-history]')?.addEventListener('click',()=>{game={screen:'history'};render();});
  document.querySelector('[data-start]')?.addEventListener('click',()=>newGame({difficulty:document.querySelector('#difficulty').value,personality:document.querySelector('#personality').value,speed:document.querySelector('#speed').value,audio:document.querySelector('#audio').checked,timer:false}));
  document.querySelector('[data-cancel]')?.addEventListener('click',reset);
  document.querySelectorAll('[data-order]').forEach(el=>el.onclick=()=>beginRound(el.dataset.order));
  document.querySelectorAll('[data-card]').forEach(el=>el.onclick=()=>{selectedId=el.dataset.card;render();});
  document.querySelector('[data-confirm]')?.addEventListener('click',confirmPlayerAction);
  document.querySelector('[data-next]')?.addEventListener('click',continueRound);
  document.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>{const slot=el.dataset.slot;if(!selectedId){selectedId=slot;render();}else if(selectedId===slot){selectedId=null;render();}else{swapSlots(selectedId,slot);}});
  document.querySelector('[data-play]')?.addEventListener('click',playSeries);
  document.querySelector('[data-rematch]')?.addEventListener('click',rematch);
  document.querySelector('[data-lineups]')?.addEventListener('click',()=>{game.phase='lineup';game.screen='lineup';render();});
  document.querySelector('[data-replay]')?.addEventListener('click',()=>{const h=histories()[0];game={screen:'replay',replayRecord:h,replayStep:0};render();});
  document.querySelectorAll('[data-history-replay]').forEach(el=>el.onclick=()=>{game={screen:'replay',replayRecord:histories()[Number(el.dataset.historyReplay)],replayStep:0};render();});
  document.querySelectorAll('[data-step]').forEach(el=>el.onclick=()=>{game.replayStep=Math.max(0,Math.min(game.replayRecord.snapshots.length-1,game.replayStep+Number(el.dataset.step)));render();});
  document.querySelectorAll('[data-home]').forEach(el=>el.onclick=()=>reset());
}
if(new URLSearchParams(location.search).get('room')) game={screen:'online-lobby'};
render();
