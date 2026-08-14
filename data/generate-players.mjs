import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SOURCE_FILE = process.argv[2] || path.join(os.tmpdir(), 'fc25data', 'male_players.csv');
const OUTPUT_FILE = new URL('./players.js', import.meta.url);
const TARGET_COUNT = 1000;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const leagueMap = {
  'Premier League': '英超', 'LALIGA EA SPORTS': '西甲', 'Serie A Enilive': '意甲',
  Bundesliga: '德甲', 'Ligue 1 McDonald’s': '法甲', 'Ligue 1 Uber Eats': '法甲'
};
const teamMap = {
  'Manchester City': '曼城', 'Manchester United': '曼联', Liverpool: '利物浦', Arsenal: '阿森纳', Chelsea: '切尔西',
  Tottenham: '热刺', 'Tottenham Hotspur': '热刺', 'Newcastle United': '纽卡斯尔联', Everton: '埃弗顿',
  'Aston Villa': '阿斯顿维拉', Bournemouth: '伯恩茅斯', Brentford: '布伦特福德', Brighton: '布莱顿',
  Burnley: '伯恩利', 'Crystal Palace': '水晶宫', Fulham: '富勒姆', Leeds: '利兹联', 'Leeds United': '利兹联',
  'Nottingham Forest': '诺丁汉森林', Sunderland: '桑德兰', 'West Ham United': '西汉姆联', Wolves: '狼队',
  'Real Madrid': '皇家马德里', Barcelona: '巴塞罗那', 'Atlético de Madrid': '马德里竞技', 'Athletic Club': '毕尔巴鄂竞技',
  Alavés: '阿拉维斯', 'Deportivo Alavés': '阿拉维斯', 'Real Betis': '皇家贝蒂斯', 'Real Sociedad': '皇家社会', Sevilla: '塞维利亚',
  Valencia: '瓦伦西亚', Villarreal: '比利亚雷亚尔', Getafe: '赫塔费', Girona: '赫罗纳', Mallorca: '马略卡',
  Osasuna: '奥萨苏纳', 'Rayo Vallecano': '巴列卡诺', Celta: '塞尔塔', 'RC Celta': '塞尔塔', Espanyol: '西班牙人',
  Inter: '国际米兰', 'Inter Milan': '国际米兰', Milan: 'AC米兰', 'AC Milan': 'AC米兰', Juventus: '尤文图斯', Napoli: '那不勒斯', Roma: '罗马', Lazio: '拉齐奥',
  Atalanta: '亚特兰大', Bologna: '博洛尼亚', Cagliari: '卡利亚里', Como: '科莫', Fiorentina: '佛罗伦萨', Genoa: '热那亚',
  Lecce: '莱切', Parma: '帕尔马', Torino: '都灵', Udinese: '乌迪内斯', Verona: '维罗纳', 'Hellas Verona': '维罗纳', Sassuolo: '萨索洛',
  'FC Bayern München': '拜仁慕尼黑', 'Bayern München': '拜仁慕尼黑', 'Borussia Dortmund': '多特蒙德', 'Bayer 04 Leverkusen': '勒沃库森',
  'RB Leipzig': '莱比锡红牛', 'Eintracht Frankfurt': '法兰克福', Freiburg: '弗赖堡', 'SC Freiburg': '弗赖堡',
  'Borussia Mönchengladbach': '门兴', Hoffenheim: '霍芬海姆', 'TSG Hoffenheim': '霍芬海姆', Mainz: '美因茨', '1. FSV Mainz 05': '美因茨',
  Stuttgart: '斯图加特', 'VfB Stuttgart': '斯图加特', 'Union Berlin': '柏林联合', 'Werder Bremen': '云达不莱梅', Wolfsburg: '沃尔夫斯堡',
  Augsburg: '奥格斯堡', 'FC Augsburg': '奥格斯堡', Heidenheim: '海登海姆', '1. FC Heidenheim 1846': '海登海姆', 'FC St. Pauli': '圣保利',
  'Paris Saint-Germain': '巴黎圣日耳曼', Marseille: '马赛', 'Olympique de Marseille': '马赛', Lyon: '里昂', 'Olympique Lyonnais': '里昂', Monaco: '摩纳哥',
  Lille: '里尔', Lens: '朗斯', Nice: '尼斯', Rennes: '雷恩', Strasbourg: '斯特拉斯堡', Toulouse: '图卢兹', Nantes: '南特',
  Brest: '布雷斯特', Angers: '昂热', Auxerre: '欧塞尔', 'Le Havre': '勒阿弗尔', Reims: '兰斯', 'Saint-Étienne': '圣埃蒂安'
};
const nationMap = {
  France: '法国', Spain: '西班牙', England: '英格兰', Germany: '德国', Italy: '意大利', Brazil: '巴西', Argentina: '阿根廷',
  Portugal: '葡萄牙', Netherlands: '荷兰', Belgium: '比利时', Norway: '挪威', Poland: '波兰', Croatia: '克罗地亚',
  Uruguay: '乌拉圭', Denmark: '丹麦', Sweden: '瑞典', Switzerland: '瑞士', Austria: '奥地利', Serbia: '塞尔维亚',
  Morocco: '摩洛哥', Nigeria: '尼日利亚', Senegal: '塞内加尔', Colombia: '哥伦比亚', Japan: '日本', Korea: '韩国',
  'Korea Republic': '韩国', Türkiye: '土耳其', Turkey: '土耳其', Egypt: '埃及', Mexico: '墨西哥', USA: '美国',
  'United States': '美国', Canada: '加拿大', Algeria: '阿尔及利亚', Ghana: '加纳', Cameroon: '喀麦隆',
  Scotland: '苏格兰', Wales: '威尔士', Ireland: '爱尔兰', 'Northern Ireland': '北爱尔兰', Ukraine: '乌克兰',
  Georgia: '格鲁吉亚', Greece: '希腊', Slovenia: '斯洛文尼亚', Slovakia: '斯洛伐克', Hungary: '匈牙利',
  Romania: '罗马尼亚', Czechia: '捷克', 'Czech Republic': '捷克', Mali: '马里', 'Côte d’Ivoire': '科特迪瓦',
  'Ivory Coast': '科特迪瓦', Ecuador: '厄瓜多尔', Paraguay: '巴拉圭', Chile: '智利', Peru: '秘鲁', Australia: '澳大利亚'
};
function positionGroup(position) {
  if (position === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return 'DEF';
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return 'MID';
  return 'FWD';
}
function grade(rating) {
  if (rating >= 97) return 'SSS'; if (rating >= 95) return 'SS'; if (rating >= 90) return 'S';
  if (rating >= 85) return 'A'; if (rating >= 75) return 'B'; if (rating >= 60) return 'C';
  if (rating >= 40) return 'D'; return 'E';
}
function gameRating(overall, rank) {
  const offset = (rank * 7) % 5 - 2;
  if (overall >= 90) return Math.min(100, 97 + (overall - 90));
  if (overall === 89) return 96;
  if (overall === 88) return 95;
  if (overall >= 85) return 90 + (overall - 85);
  if (overall >= 83) return 85 + (overall - 83);
  if (overall >= 77) return 75 + (overall - 77) + offset;
  if (overall >= 71) return 60 + (overall - 71) * 2 + offset;
  if (overall >= 64) return 40 + (overall - 64) * 3 + offset;
  return Math.max(25, 25 + (overall - 55) * 2 + offset);
}

if (!fs.existsSync(SOURCE_FILE)) throw new Error(`FC 25 source CSV not found: ${SOURCE_FILE}`);
const sourceRows = parseCsv(fs.readFileSync(SOURCE_FILE, 'utf8').replace(/^\uFEFF/, ''));
const unique = new Map();
sourceRows.forEach((row) => {
  const name = row.Name?.trim();
  const overall = Number(row.OVR);
  if (!name || !overall || Number(row.Rank) < 1) return;
  const key = name.toLocaleLowerCase('en');
  if (!unique.has(key)) unique.set(key, row);
});
const selected = [...unique.values()].sort((a, b) => Number(a.Rank) - Number(b.Rank) || Number(b.OVR) - Number(a.OVR)).slice(0, TARGET_COUNT);
if (selected.length !== TARGET_COUNT) throw new Error(`Expected ${TARGET_COUNT} players, got ${selected.length}`);
const players = selected.map((row, index) => {
  const rating = Math.max(1, Math.min(100, gameRating(Number(row.OVR), index + 1)));
  return {
    id: `player_${String(index + 1).padStart(4, '0')}`,
    name: row.Name.trim(),
    englishName: row.Name.trim(),
    country: nationMap[row.Nation] || row.Nation || '未知',
    position: positionGroup(row.Position),
    detailedPosition: row.Position,
    alternativePositions: (row['Alternative positions'] || '').split(',').map((position) => position.trim()).filter(Boolean),
    club: teamMap[row.Team] || row.Team || '',
    league: leagueMap[row.League] || row.League || '',
    baseRating: rating,
    rating,
    grade: grade(rating),
    upgradeCount: 0
  };
});
fs.writeFileSync(OUTPUT_FILE, `export const PLAYER_DATA = ${JSON.stringify(players, null, 2)};\n`, 'utf8');
console.log(`Generated ${players.length} real players from ${SOURCE_FILE}`);
