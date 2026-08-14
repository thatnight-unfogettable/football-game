import { PLAYER_DATA } from '../data/players.js';

export const RULES_VERSION = 1;
export const ROUND_PLAN = [
  ['FWD','中锋'],['DEF','边后卫'],['MID','组织中场'],['DEF','中卫'],['MID','防守中场'],
  ['FWD','边锋'],['DEF','中卫'],['MID','全能中场'],['DEF','边后卫'],['FWD','边锋']
];
export const SLOTS = ['LW','ST','RW','CM1','CDM','CM2','LB','CB1','CB2','RB','GK'];
export const COURTOIS = { id:'shared_courtois', name:'蒂博·库尔图瓦', englishName:'Thibaut Courtois', country:'比利时', club:'皇家马德里', league:'西甲', position:'GK', detailedPosition:'GK', alternativePositions:[], rating:90, grade:'S', shared:true };
const NAME_MAP = {
  'Kylian Mbappé':'基利安·姆巴佩','Rodri':'罗德里','Erling Haaland':'埃尔林·哈兰德','Jude Bellingham':'裘德·贝林厄姆','Vinícius Júnior':'维尼修斯·儒尼奥尔',
  'Kevin De Bruyne':'凯文·德布劳内','Harry Kane':'哈里·凯恩','Mohamed Salah':'穆罕默德·萨拉赫','Lautaro Martínez':'劳塔罗·马丁内斯','Robert Lewandowski':'罗伯特·莱万多夫斯基',
  'Virgil van Dijk':'维吉尔·范戴克','Alisson':'阿利松','Ederson':'埃德森','Rúben Dias':'鲁本·迪亚斯','Antonio Rüdiger':'安东尼奥·吕迪格','William Saliba':'威廉·萨利巴',
  'Federico Valverde':'费德里科·巴尔韦德','Martin Ødegaard':'马丁·厄德高','Bruno Fernandes':'布鲁诺·费尔南德斯','Bernardo Silva':'贝尔纳多·席尔瓦','Bukayo Saka':'布卡约·萨卡',
  'Phil Foden':'菲尔·福登','Jamal Musiala':'贾马尔·穆西亚拉','Florian Wirtz':'弗洛里安·维尔茨','Pedri':'佩德里','Gavi':'加维','Rodrygo':'罗德里戈',
  'Antoine Griezmann':'安托万·格列兹曼','Victor Osimhen':'维克托·奥斯梅恩','Khvicha Kvaratskhelia':'赫维恰·克瓦拉茨赫利亚','Son Heung Min':'孙兴慜','Lionel Messi':'利昂内尔·梅西',
  'Cristiano Ronaldo':'克里斯蒂亚诺·罗纳尔多','Neymar Jr':'内马尔','Declan Rice':'德克兰·赖斯','Joshua Kimmich':'约书亚·基米希','Achraf Hakimi':'阿什拉夫·哈基米',
  'Theo Hernández':'特奥·埃尔南德斯','Mike Maignan':'迈克·迈尼昂','Gianluigi Donnarumma':'詹路易吉·多纳鲁马','Marc-André ter Stegen':'马克-安德烈·特尔施特根'
};
const SLOT_POS = { LW:['LW','LM','ST'], ST:['ST','CF','LW','RW'], RW:['RW','RM','ST'], CM1:['CM','CAM','CDM'], CDM:['CDM','CM','CB'], CM2:['CM','CAM','CDM'], LB:['LB','LWB','CB'], CB1:['CB','CDM','LB','RB'], CB2:['CB','CDM','LB','RB'], RB:['RB','RWB','CB'], GK:['GK'] };

export function displayName(player){ return NAME_MAP[player.englishName] || (/[\u3400-\u9fff]/.test(player.name||'') ? player.name : player.englishName); }
export function createRng(seed){ let s=(Number(seed)||Date.now())>>>0; return { next(){s^=s<<13;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;}, get state(){return s;} }; }
function shuffled(list,rng){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng.next()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function tierChunks(pool, rounds, rng){
  const sorted=[...pool].sort((a,b)=>b.rating-a.rating).slice(0,rounds*12);
  const tiers=Array.from({length:4},(_,i)=>shuffled(sorted.slice(i*sorted.length/4,(i+1)*sorted.length/4),rng));
  return Array.from({length:rounds},()=>shuffled(tiers.flatMap(t=>t.splice(0,3)),rng));
}
export function preparePlayers(){ return PLAYER_DATA.map(p=>({...p, nameZh:displayName(p), alternativePositions:p.alternativePositions||[]})); }
export function createCandidateRounds(players,rng){
  const pools={FWD:players.filter(p=>p.position==='FWD'),MID:players.filter(p=>p.position==='MID'),DEF:players.filter(p=>p.position==='DEF')};
  const chunks={FWD:tierChunks(pools.FWD,3,rng),MID:tierChunks(pools.MID,3,rng),DEF:tierChunks(pools.DEF,4,rng)};
  const indexes={FWD:0,MID:0,DEF:0};
  return ROUND_PLAN.map(([pos])=>chunks[pos][indexes[pos]++]);
}
export function newGame(settings={}){
  const seed=settings.seed||Date.now();const rng=createRng(seed);const players=preparePlayers();
  return {version:RULES_VERSION,seed,rngState:rng.state,settings:{difficulty:'normal',personality:'power',speed:'normal',timer:false,...settings},phase:'ORDER',round:0,banTurn:0,firstBanner:null,candidatesByRound:createCandidateRounds(players,rng).map(r=>r.map(p=>p.id)),players:Object.fromEntries(players.map(p=>[p.id,p])),candidates:[],bans:{player:[],ai:[]},roundBans:[],rosters:{player:[COURTOIS.id],ai:[COURTOIS.id]},assignments:{player:{GK:COURTOIS.id},ai:{GK:COURTOIS.id}},log:[],selected:null,series:null};
}
export function beginRound(game,playerOrder){game.firstBanner=playerOrder;game.banTurn=0;game.roundBans=[];game.selected=null;game.candidates=game.candidatesByRound[game.round];game.phase='BAN';return game;}
export function actingSide(game){const first=game.firstBanner;return game.banTurn%2===0?first:(first==='player'?'ai':'player');}
export function available(game){const banned=new Set(game.roundBans);const picked=new Set([...game.rosters.player,...game.rosters.ai]);return game.candidates.filter(id=>!banned.has(id)&&!picked.has(id));}
export function ban(game,side,id,reason=''){if(game.phase!=='BAN'||actingSide(game)!==side||!available(game).includes(id))return false;game.roundBans.push(id);game.bans[side].push(id);game.log.push({type:'ban',round:game.round,side,id,reason});game.banTurn++;if(game.banTurn===6){game.phase='PICK';game.pickTurn=side;}return true;}
export function pick(game,side,id){if(game.phase!=='PICK'||game.pickTurn!==side||!available(game).includes(id))return false;game.rosters[side].push(id);game.log.push({type:'pick',round:game.round,side,id});if(game.roundPick){game.phase='ROUND_END';game.roundPick=null;}else{game.roundPick=id;game.pickTurn=side==='player'?'ai':'player';}return true;}
function compat(player,slot){const list=SLOT_POS[slot]||[];const all=[player.detailedPosition,...(player.alternativePositions||[])];const idx=Math.min(...all.map(p=>list.indexOf(p)).filter(i=>i>=0));return Number.isFinite(idx)?[1,.96,.92,.92][Math.min(idx,3)]:.92;}
function permutations(arr,k,prefix=[],out=[]){if(prefix.length===k){out.push(prefix);return out;}arr.forEach((v,i)=>permutations([...arr.slice(0,i),...arr.slice(i+1)],k,[...prefix,v],out));return out;}
export function optimizeLineup(game,side){
  const ids=game.rosters[side].filter(id=>id!==COURTOIS.id);const groups={FWD:ids.filter(id=>game.players[id].position==='FWD'),MID:ids.filter(id=>game.players[id].position==='MID'),DEF:ids.filter(id=>game.players[id].position==='DEF')};
  const lineSlots={FWD:['LW','ST','RW'],MID:['CM1','CDM','CM2'],DEF:['LB','CB1','CB2','RB']};const assignment={GK:COURTOIS.id};
  Object.entries(groups).forEach(([line,lineIds])=>{let best=null,bestScore=-1;permutations(lineIds,lineIds.length).forEach(order=>{const score=order.reduce((s,id,i)=>s+game.players[id].rating*compat(game.players[id],lineSlots[line][i]),0);if(score>bestScore){bestScore=score;best=order;}});best?.forEach((id,i)=>assignment[lineSlots[line][i]]=id);});
  game.assignments[side]=assignment;return assignment;
}
function thresholdScore(count,steps){let score=0;steps.forEach(([n,v])=>{if(count>=n)score=v;});return score;}
export function strength(game,side){
  const a=game.assignments[side];const players=SLOTS.map(s=>s==='GK'?COURTOIS:game.players[a[s]]).filter(Boolean);
  const line=(slots)=>slots.reduce((s,slot)=>{const p=slot==='GK'?COURTOIS:game.players[a[slot]];return s+(p?p.rating*compat(p,slot):0);},0)/slots.length;
  const paper=line(['GK'])*.1+line(['LB','CB1','CB2','RB'])*.3+line(['CM1','CDM','CM2'])*.3+line(['LW','ST','RW'])*.3;
  const slotFit=SLOTS.filter(s=>s!=='GK').reduce((s,slot)=>s+compat(game.players[a[slot]],slot),0)/10*32;
  const template=(['LW','ST','RW'].every(s=>compat(game.players[a[s]],s)>=.96)?3:0)+(['CM1','CDM','CM2'].every(s=>compat(game.players[a[s]],s)>=.96)?2:0)+(['LB','CB1','CB2','RB'].every(s=>compat(game.players[a[s]],s)>=.96)?3:0);
  const groupScore=(field,steps,cap)=>{const counts={};players.filter(p=>!p.shared).forEach(p=>counts[p[field]]=(counts[p[field]]||0)+1);return Math.min(cap,Object.values(counts).reduce((s,c)=>s+thresholdScore(c,steps),0));};
  const club=groupScore('club',[[2,4],[3,8],[4,12]],20),league=groupScore('league',[[2,3],[4,7],[6,11]],15),nation=groupScore('country',[[2,3],[3,6],[5,10]],15);
  const ratings=players.map(p=>p.rating),leaders=Math.min(6,ratings.filter(r=>r>=85).length*2),gap=Math.max(...ratings)-Math.min(...ratings),balance=gap<=8?4:gap<=13?3:gap<=18?2:1;
  const chemistry=Math.min(100,slotFit+template+club+league+nation+leaders+balance);return {paper:+paper.toFixed(1),chemistry:+chemistry.toFixed(1),overall:+(paper*.7+chemistry*.3).toFixed(1),lines:{attack:+line(['LW','ST','RW']).toFixed(1),midfield:+line(['CM1','CDM','CM2']).toFixed(1),defense:+line(['LB','CB1','CB2','RB']).toFixed(1)}};
}
export function aiChooseBan(game,rng){const ids=available(game),d=game.settings.difficulty,p=game.settings.personality;const mistake=d==='easy'?.3:d==='hard'?.05:.15;if(rng.next()<mistake)return ids[Math.floor(rng.next()*ids.length)];return [...ids].sort((a,b)=>{const A=game.players[a],B=game.players[b];let av=A.rating,bv=B.rating;if(p==='counter'){av+=previewRating(game,'player',a)*.4;bv+=previewRating(game,'player',b)*.4;}return bv-av;})[0];}
export function previewRating(game,side,id){const p=game.players[id];const line=game.rosters[side].filter(x=>x!==COURTOIS.id).map(x=>game.players[x]);return p.rating+(line.some(x=>x.club===p.club)?3:0)+(line.some(x=>x.league===p.league)?1:0);}
export function aiChoosePick(game,rng){const ids=available(game),mistake=game.settings.difficulty==='easy'?.3:game.settings.difficulty==='hard'?.05:.15;if(rng.next()<mistake)return ids[Math.floor(rng.next()*ids.length)];return [...ids].sort((a,b)=>previewRating(game,'ai',b)-previewRating(game,'ai',a))[0];}
export function nextRound(game){game.round++;if(game.round>=10){optimizeLineup(game,'player');optimizeLineup(game,'ai');game.phase='LINEUP';}else game.phase='ORDER';return game;}
function poisson(lambda,rng){let l=Math.exp(-lambda),p=1,k=0;do{k++;p*=rng.next();}while(p>l&&k<12);return k-1;}
export function simulateSeries(game){const rng=createRng(game.seed^0x9e3779b9);const ps=strength(game,'player'),as=strength(game,'ai');const matches=[],wins={player:0,ai:0};for(let i=0;i<3&&wins.player<2&&wins.ai<2;i++){const home=i===0?'player':i===1?'ai':'neutral';const pv=ps.overall+(home==='player'?1:0)+(rng.next()-.5)*4*(1-ps.chemistry/200);const av=as.overall+(home==='ai'?1:0)+(rng.next()-.5)*4*(1-as.chemistry/200);const pg=poisson(Math.max(.25,1.35*Math.exp((pv-av)/18)),rng),ag=poisson(Math.max(.25,1.35*Math.exp((av-pv)/18)),rng);let winner=pg>ag?'player':ag>pg?'ai':(ps.overall-as.overall>.5?'player':as.overall-ps.overall>.5?'ai':ps.chemistry>=as.chemistry?'player':'ai');wins[winner]++;matches.push({home,pg,ag,winner});}game.series={matches,wins,playerStrength:ps,aiStrength:as,winner:wins.player>wins.ai?'player':'ai'};game.phase='RESULT';return game.series;}
