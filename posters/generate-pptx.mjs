// 用 pptxgenjs 生成「绿茵禁选对决」小红书宣传 PPTX
// 5 张竖版海报（小红书 3:4 = 1242x1660，自定义 8.625" x 11.5"）
import pptxgen from 'pptxgenjs';
import { mkdir } from 'node:fs/promises';

const outDir = 'posters';
await mkdir(outDir, { recursive: true });

const pptx = new pptxgen();
pptx.defineLayout({ name: 'XHS_VERT', width: 8.625, height: 11.5 });
pptx.layout = 'XHS_VERT';
pptx.title = 'Football BP Arena - Xiaohongshu Posters';
pptx.author = 'Football BP Arena';

// 主题色（取自游戏样式表）
const C = {
  bg: '0A0E15',
  green: '42E08B',
  red: 'FF5D70',
  gold: 'F6C65B',
  blue: '5E9EFF',
  panel: '101821',
  panel2: '172431',
  line: '29394A',
  text: 'F0F5F3',
  muted: '8FA09A',
  pitch: '0D432D',
  pitch2: '0A3423',
};

// 实色近似（替代透明色）
const ALPHA = {
  dim: '889098',     // FFFFFF80
  soft: '9FA8A4',    // FFFFFFAA
  faint: '5A6470',   // FFFFFF40
  glass: '101821',   // FFFFFF0A
  hairline: '252E38',// FFFFFF20
  haze: '1A2530',    // FFFFFF14
  ghost: '10171E',   // FFFFFF0C
  border: '3A4654',  // FFFFFF30
};

const FONT_CN = 'Microsoft YaHei';
const FONT_EN = 'Arial';

function addGradientBg(slide, c1, c2, c3) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 8.625, h: 4, fill: { color: c1 }, line: { color: c1 }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 4, w: 8.625, h: 3.5, fill: { color: c2 }, line: { color: c2 }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.5, w: 8.625, h: 4, fill: { color: c3 }, line: { color: c3 }
  });
}

function addCorner(slide) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.3, y: 0.3, w: 0.85, h: 0.85, fill: { type: 'none' }, line: { color: 'FFFFFF', width: 1 }, rectRadius: 0.08
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 7.45, y: 10.35, w: 0.85, h: 0.85, fill: { type: 'none' }, line: { color: 'FFFFFF', width: 1 }, rectRadius: 0.08
  });
}

function addStamp(slide, text, color) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 6.4, y: 0.5, w: 1.8, h: 0.55, fill: { type: 'none' }, line: { color, width: 2 }, rectRadius: 0.08, rotate: 8
  });
  slide.addText(text, {
    x: 6.4, y: 0.5, w: 1.8, h: 0.55,
    fontSize: 13, fontFace: FONT_CN, color, bold: true, align: 'center', valign: 'middle', rotate: 8
  });
}

function addFooter(slide) {
  slide.addText('F O O T B A L L   B P   A R E N A', {
    x: 0, y: 11, w: 8.625, h: 0.4,
    fontSize: 12, color: 'FFFFFF', fontFace: FONT_EN, align: 'center', charSpacing: 8
  });
}

// ============ 海报1：主视觉 KV ============
{
  const s = pptx.addSlide();
  addGradientBg(s, '0D3A2A', '061711', '020604');
  addCorner(s);
  addStamp(s, '2026 · 新作', C.green);

  s.addText('⚽ 足 球 × BP 对 决 ⚽', {
    x: 0, y: 0.85, w: 8.625, h: 0.5,
    fontSize: 18, color: C.green, fontFace: FONT_CN, bold: true, align: 'center', charSpacing: 8
  });

  s.addText([
    { text: '绿茵', options: { color: 'FFFFFF' } },
    { text: '\n禁选', options: { color: C.green } },
    { text: '\n对决', options: { color: 'FFFFFF' } }
  ], {
    x: 0, y: 1.4, w: 8.625, h: 3,
    fontSize: 130, fontFace: FONT_CN, bold: true, align: 'center', lineSpacingMultiple: 0.95
  });

  s.addText('FOOTBALL · BAN · PICK · ARENA', {
    x: 0, y: 4.55, w: 8.625, h: 0.5,
    fontSize: 18, color: C.gold, fontFace: FONT_EN, bold: true, align: 'center', charSpacing: 6
  });

  s.addText([
    { text: '把 王 者 BP 搬 进 ', options: { color: 'FFFFFF' } },
    { text: '绿 茵 场', options: { color: C.red } }
  ], {
    x: 0, y: 5.1, w: 8.625, h: 0.7,
    fontSize: 30, fontFace: FONT_CN, bold: true, align: 'center'
  });

  // VS 框背景三层渐变感
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.8, y: 6, w: 6.95, h: 1.95, fill: { color: '0D3A2A' }, line: { color: 'FFFFFF', width: 1 }, rectRadius: 0.15
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 0.8, y: 6, w: 4.65, h: 1.95, fill: { color: '171B29' }, line: { type: 'none' }, rectRadius: 0.15
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 4.1, y: 6, w: 3.65, h: 1.95, fill: { color: '3D0D1C' }, line: { type: 'none' }, rectRadius: 0.15
  });

  // 左：玩家
  s.addText('你 · 主队', { x: 0.95, y: 6.15, w: 2.4, h: 0.4, fontSize: 13, color: C.blue, bold: true, align: 'center', fontFace: FONT_CN });
  s.addText('姆巴佩', { x: 0.95, y: 6.55, w: 2.4, h: 0.6, fontSize: 32, color: 'FFFFFF', bold: true, align: 'center', fontFace: FONT_CN });
  s.addText('中锋 · 法国', { x: 0.95, y: 7.15, w: 2.4, h: 0.4, fontSize: 13, color: C.muted, align: 'center', fontFace: FONT_CN });
  s.addText('98', { x: 0.95, y: 7.45, w: 2.4, h: 0.5, fontSize: 28, color: C.gold, bold: true, align: 'center', fontFace: FONT_EN });

  // 中：VS
  s.addText('VS', {
    x: 3.6, y: 6.55, w: 1.3, h: 1,
    fontSize: 60, color: C.gold, bold: true, align: 'center', valign: 'middle', fontFace: FONT_EN
  });

  // 右：对手
  s.addText('对手 · AI', { x: 5.15, y: 6.15, w: 2.4, h: 0.4, fontSize: 13, color: C.red, bold: true, align: 'center', fontFace: FONT_CN });
  s.addText('罗德里', { x: 5.15, y: 6.55, w: 2.4, h: 0.6, fontSize: 32, color: 'FFFFFF', bold: true, align: 'center', fontFace: FONT_CN });
  s.addText('后腰 · 西班牙', { x: 5.15, y: 7.15, w: 2.4, h: 0.4, fontSize: 13, color: C.muted, align: 'center', fontFace: FONT_CN });
  s.addText('98', { x: 5.15, y: 7.45, w: 2.4, h: 0.5, fontSize: 28, color: C.gold, bold: true, align: 'center', fontFace: FONT_EN });

  // 三大特性
  const feats = [
    { big: '6 轮', sub: '策略 BP', tip: '禁 4 选 8' },
    { big: '11 人', sub: '真实阵容', tip: '4-3-3 摆位' },
    { big: '200+', sub: '球员卡池', tip: '真实评分' },
  ];
  feats.forEach((f, i) => {
    const x = 0.6 + i * 2.5;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 8.3, w: 2.2, h: 1.4, fill: { color: '101821' }, line: { color: C.line, width: 1 }, rectRadius: 0.1
    });
    s.addText(f.big, { x, y: 8.35, w: 2.2, h: 0.5, fontSize: 24, color: C.green, bold: true, align: 'center', fontFace: FONT_EN });
    s.addText(f.sub, { x, y: 8.85, w: 2.2, h: 0.4, fontSize: 15, color: 'FFFFFF', bold: true, align: 'center', fontFace: FONT_CN });
    s.addText(f.tip, { x, y: 9.25, w: 2.2, h: 0.4, fontSize: 11, color: C.muted, align: 'center', fontFace: FONT_CN });
  });

  // CTA 按钮
  s.addShape(pptx.ShapeType.roundRect, {
    x: 2.8, y: 9.95, w: 3, h: 0.8, fill: { color: C.green }, line: { type: 'none' }, rectRadius: 0.4
  });
  s.addText('👉 立即开战', {
    x: 2.8, y: 9.95, w: 3, h: 0.8,
    fontSize: 22, color: '04130C', bold: true, align: 'center', valign: 'middle', fontFace: FONT_CN, charSpacing: 2
  });

  addFooter(s);
}

// ============ 海报2：4步玩法 ============
{
  const s = pptx.addSlide();
  addGradientBg(s, '2A0D1A', '170610', '050204');
  addCorner(s);
  addStamp(s, '玩法 · 4 步', C.red);

  s.addText('如 何 上 手', {
    x: 0, y: 0.85, w: 8.625, h: 0.5,
    fontSize: 20, color: C.red, fontFace: FONT_CN, bold: true, align: 'center', charSpacing: 6
  });

  s.addText([
    { text: '四步\n', options: { color: 'FFFFFF' } },
    { text: '组 队 干 翻 对 手', options: { color: C.red } }
  ], {
    x: 0, y: 1.4, w: 8.625, h: 1.8,
    fontSize: 48, fontFace: FONT_CN, bold: true, align: 'center', lineSpacingMultiple: 1
  });

  s.addText('HOW · TO · PLAY · IN · 4 · STEPS', {
    x: 0, y: 3.25, w: 8.625, h: 0.4,
    fontSize: 14, color: ALPHA.dim, fontFace: FONT_EN, align: 'center', charSpacing: 8
  });

  const steps = [
    { n: 1, color: C.red, title: '建房间 · 拉兄弟', desc: '6 位房间码 / 邀请链接 / 单人 vs AI\n微信群喊一嗓子，3 秒进房', badge: '免注册 · 即开即玩' },
    { n: 2, color: C.gold, title: '轮流 BAN · 禁掉关键人', desc: '共 4 个 BAN 位\n不喜欢的球星 · 直接拉黑 ❌', badge: '位置均衡 · 选位优先' },
    { n: 3, color: C.blue, title: '挑阵容 · 摆 4-3-3', desc: '从卡池里抢 8 位球星\n左右边锋 / 中场 / 后卫自由摆位', badge: '真实评分 · 位置适配' },
    { n: 4, color: C.green, title: '比分对决 · 看 MVP', desc: '系统自动算分 · 高分胜出\n当场出 MVP · 完赛可回放复盘', badge: '回放系统 · 战术复盘' },
  ];

  steps.forEach((step, i) => {
    const y = 3.85 + i * 1.55;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.7, y, w: 7.25, h: 1.4, fill: { color: ALPHA.glass }, line: { color: ALPHA.hairline, width: 1 }, rectRadius: 0.12
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: 0.95, y: y + 0.2, w: 1, h: 1, fill: { color: step.color }, line: { type: 'none' }
    });
    s.addText(String(step.n), {
      x: 0.95, y: y + 0.2, w: 1, h: 1,
      fontSize: 36, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', fontFace: FONT_EN
    });
    s.addText(step.title, {
      x: 2.15, y: y + 0.15, w: 5.6, h: 0.4,
      fontSize: 18, color: 'FFFFFF', bold: true, fontFace: FONT_CN
    });
    s.addText(step.desc, {
      x: 2.15, y: y + 0.55, w: 5.6, h: 0.6,
      fontSize: 11, color: C.muted, fontFace: FONT_CN, lineSpacingMultiple: 1.2
    });
    s.addText(step.badge, {
      x: 2.15, y: y + 1.05, w: 5.6, h: 0.3,
      fontSize: 10, color: C.gold, bold: true, fontFace: FONT_CN
    });
  });

  s.addText([
    { text: '不会玩？', options: { color: 'FFFFFF' } },
    { text: '点开就懂', options: { color: C.red } },
    { text: ' · 3 分钟上手', options: { color: 'FFFFFF' } }
  ], {
    x: 0, y: 10.15, w: 8.625, h: 0.4,
    fontSize: 17, bold: true, align: 'center', fontFace: FONT_CN
  });

  s.addShape(pptx.ShapeType.roundRect, {
    x: 3, y: 10.55, w: 2.6, h: 0.55, fill: { color: C.red }, line: { type: 'none' }, rectRadius: 0.27
  });
  s.addText('🚀 进入战场', {
    x: 3, y: 10.55, w: 2.6, h: 0.55,
    fontSize: 16, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', fontFace: FONT_CN
  });
}

// ============ 海报3：球员卡池 ============
{
  const s = pptx.addSlide();
  addGradientBg(s, '1C1342', '0C0820', '04030C');
  addCorner(s);
  addStamp(s, '卡池 · 200+', C.gold);

  s.addText('REAL · PLAYERS', {
    x: 0, y: 0.85, w: 8.625, h: 0.4,
    fontSize: 16, color: C.gold, bold: true, align: 'center', charSpacing: 10, fontFace: FONT_EN
  });

  s.addText([
    { text: '球 星 ', options: { color: 'FFFFFF' } },
    { text: '卡 池', options: { color: C.gold } }
  ], {
    x: 0, y: 1.3, w: 8.625, h: 1.4,
    fontSize: 96, bold: true, align: 'center', fontFace: FONT_CN
  });

  s.addText('姆巴佩 · 罗德里 · 哈兰德 · 维尼修斯', {
    x: 0, y: 2.75, w: 8.625, h: 0.5,
    fontSize: 16, color: ALPHA.soft, bold: true, align: 'center', fontFace: FONT_CN
  });

  const cards = [
    { grade: 'SSS', border: C.gold, pos: 'ST', av: 'K', rating: '98', name: '姆巴佩', en: 'Mbappe', club: '皇家马德里', league: '西甲' },
    { grade: 'SS', border: 'D8E1E8', pos: 'CDM', av: 'R', rating: '98', name: '罗德里', en: 'Rodri', club: '曼城', league: '英超' },
    { grade: 'S', border: 'BE7A4C', pos: 'LW', av: 'V', rating: '96', name: '维尼修斯', en: 'Vinicius Jr.', club: '皇家马德里', league: '西甲' },
  ];

  cards.forEach((card, i) => {
    const x = 0.45 + i * 2.65;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 3.5, w: 2.4, h: 5, fill: { color: '101821' }, line: { color: card.border, width: 2 }, rectRadius: 0.15
    });
    s.addText(card.grade, {
      x: x + 0.15, y: 3.65, w: 1, h: 0.4,
      fontSize: 22, color: card.border, bold: true, fontFace: FONT_EN
    });
    s.addText(card.pos, {
      x: x + 1.4, y: 3.7, w: 0.85, h: 0.35,
      fontSize: 13, color: ALPHA.soft, bold: true, align: 'right', fontFace: FONT_EN
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.2, y: 4.2, w: 0.95, h: 0.95, fill: { color: ALPHA.haze }, line: { type: 'none' }
    });
    s.addText(card.av, {
      x: x + 0.2, y: 4.2, w: 0.95, h: 0.95,
      fontSize: 36, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', fontFace: FONT_EN
    });
    s.addText(card.rating, {
      x: x + 1.2, y: 4.2, w: 1.1, h: 1,
      fontSize: 56, color: '1F2530', bold: true, align: 'right', valign: 'middle', fontFace: FONT_EN
    });
    s.addText(card.name, {
      x: x + 0.15, y: 7.5, w: 2.1, h: 0.4,
      fontSize: 22, color: 'FFFFFF', bold: true, fontFace: FONT_CN
    });
    s.addText(card.en, {
      x: x + 0.15, y: 7.9, w: 2.1, h: 0.3,
      fontSize: 12, color: ALPHA.dim, fontFace: FONT_EN
    });
    s.addText([
      { text: card.club, options: { color: ALPHA.soft } },
      { text: ' · ', options: { color: ALPHA.faint } },
      { text: card.league, options: { color: C.gold, bold: true } }
    ], {
      x: x + 0.15, y: 8.2, w: 2.1, h: 0.3,
      fontSize: 12, fontFace: FONT_CN
    });
  });

  s.addText([
    { text: '全 阵 容 收 录 ', options: { color: 'FFFFFF' } },
    { text: '200+', options: { color: C.gold, bold: true } },
    { text: ' 真 实 球 星 · 持 续 更 新', options: { color: 'FFFFFF' } }
  ], {
    x: 0, y: 9, w: 8.625, h: 0.6,
    fontSize: 22, bold: true, align: 'center', fontFace: FONT_CN
  });

  addFooter(s);
}

// ============ 海报4：阵型摆位 ============
{
  const s = pptx.addSlide();
  addGradientBg(s, '0D432D', '082B1C', '04140C');
  addCorner(s);
  addStamp(s, '4-3-3 · 摆位', C.green);

  s.addText([
    { text: '真 球 场 摆 ', options: { color: 'FFFFFF' } },
    { text: '4-3-3', options: { color: C.green } }
  ], {
    x: 0, y: 0.85, w: 8.625, h: 1.2,
    fontSize: 60, bold: true, align: 'center', fontFace: FONT_CN
  });

  s.addText('TACTICAL · LINEUP · VIEW', {
    x: 0, y: 2.05, w: 8.625, h: 0.4,
    fontSize: 14, color: ALPHA.soft, bold: true, align: 'center', charSpacing: 6, fontFace: FONT_EN
  });

  // 球场
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 2.7, w: 6.4, h: 7.3, fill: { color: '0D432D' }, line: { color: ALPHA.border, width: 2 }, rectRadius: 0.18
  });
  // 中圈
  s.addShape(pptx.ShapeType.ellipse, {
    x: 3.4, y: 5.7, w: 1, h: 1, fill: { type: 'none' }, line: { color: ALPHA.border, width: 1 }
  });

  const slots = [
    { x: 1.5, y: 3.3, p: 'LW', n: '姆巴佩', r: '98' },
    { x: 3.7, y: 3.05, p: 'ST', n: '哈兰德', r: '97' },
    { x: 5.9, y: 3.3, p: 'RW', n: '维尼修斯', r: '96' },
    { x: 1.85, y: 5.1, p: 'CM', n: '德布劳内', r: '95' },
    { x: 3.7, y: 5.85, p: 'CDM', n: '罗德里', r: '98' },
    { x: 5.55, y: 5.1, p: 'CM', n: '贝林厄姆', r: '95' },
    { x: 1.05, y: 7.1, p: 'LB', n: '阿方索', r: '93' },
    { x: 2.8, y: 7.45, p: 'CB', n: '范戴克', r: '94' },
    { x: 4.6, y: 7.45, p: 'CB', n: '迪亚斯', r: '93' },
    { x: 6.35, y: 7.1, p: 'RB', n: '卡瓦哈尔', r: '92' },
    { x: 3.7, y: 9.05, p: 'GK', n: '库尔图瓦', r: '90' },
  ];

  slots.forEach((slot) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: slot.x - 0.55, y: slot.y - 0.3, w: 1.1, h: 0.6, fill: { color: C.panel }, line: { color: C.green, width: 1 }, rectRadius: 0.06
    });
    s.addText(slot.p, {
      x: slot.x - 0.55, y: slot.y - 0.3, w: 1.1, h: 0.22,
      fontSize: 8, color: C.muted, bold: true, align: 'center', fontFace: FONT_EN
    });
    s.addText(slot.n, {
      x: slot.x - 0.55, y: slot.y - 0.08, w: 1.1, h: 0.22,
      fontSize: 11, color: 'FFFFFF', bold: true, align: 'center', fontFace: FONT_CN
    });
    s.addText(slot.r, {
      x: slot.x - 0.55, y: slot.y + 0.15, w: 1.1, h: 0.18,
      fontSize: 10, color: C.gold, bold: true, align: 'center', fontFace: FONT_EN
    });
  });

  // 右侧比分块
  s.addShape(pptx.ShapeType.roundRect, {
    x: 7.05, y: 2.7, w: 1.3, h: 3.4, fill: { color: C.panel }, line: { color: C.blue, width: 1 }, rectRadius: 0.08
  });
  s.addText('你', {
    x: 7.05, y: 2.85, w: 1.3, h: 0.3,
    fontSize: 13, color: 'FFFFFF', bold: true, align: 'center', fontFace: FONT_CN
  });
  s.addText('2486', {
    x: 7.05, y: 3.15, w: 1.3, h: 0.5,
    fontSize: 26, color: C.blue, bold: true, align: 'center', fontFace: FONT_EN
  });

  s.addShape(pptx.ShapeType.roundRect, {
    x: 7.05, y: 6.2, w: 1.3, h: 3.4, fill: { color: C.panel }, line: { color: C.red, width: 1 }, rectRadius: 0.08
  });
  s.addText('对手', {
    x: 7.05, y: 6.35, w: 1.3, h: 0.3,
    fontSize: 13, color: 'FFFFFF', bold: true, align: 'center', fontFace: FONT_CN
  });
  s.addText('2391', {
    x: 7.05, y: 6.65, w: 1.3, h: 0.5,
    fontSize: 26, color: C.red, bold: true, align: 'center', fontFace: FONT_EN
  });

  // 底部数据
  const stats = [
    { b: '2486', s: '总评分' },
    { b: '+95', s: '评分领先' },
    { b: 'S×4', s: 'S级球员' },
    { b: '完美', s: '位置适配' },
  ];
  stats.forEach((stat, i) => {
    const x = 0.5 + i * 1.97;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 10.15, w: 1.85, h: 0.85, fill: { color: ALPHA.ghost }, line: { color: ALPHA.hairline, width: 1 }, rectRadius: 0.08
    });
    s.addText(stat.b, {
      x, y: 10.18, w: 1.85, h: 0.4,
      fontSize: 18, color: C.green, bold: true, align: 'center', fontFace: FONT_EN
    });
    s.addText(stat.s, {
      x, y: 10.55, w: 1.85, h: 0.3,
      fontSize: 10, color: ALPHA.soft, align: 'center', fontFace: FONT_CN
    });
  });
}

// ============ 海报5：玩家口碑 ============
{
  const s = pptx.addSlide();
  addGradientBg(s, '3D1A05', '1A0C02', '08030A');
  addCorner(s);
  addStamp(s, '真实玩家反馈', C.gold);

  s.addText('P L A Y E R · S A Y', {
    x: 0, y: 0.85, w: 8.625, h: 0.4,
    fontSize: 14, color: C.gold, bold: true, align: 'center', charSpacing: 12, fontFace: FONT_EN
  });

  s.addText([
    { text: '球 迷 都 ', options: { color: 'FFFFFF' } },
    { text: '玩 上 瘾', options: { color: C.gold } }
  ], {
    x: 0, y: 1.3, w: 8.625, h: 1.4,
    fontSize: 60, bold: true, align: 'center', fontFace: FONT_CN
  });

  s.addText('真 · 球迷 · 真 · 上头', {
    x: 0, y: 2.7, w: 8.625, h: 0.4,
    fontSize: 18, color: ALPHA.soft, bold: true, align: 'center', charSpacing: 4, fontFace: FONT_CN
  });

  const quotes = [
    { color: C.gold, av: 'A', name: '@皇马老球迷', time: '5分钟前', text: '以前看球只能嘴炮，现在用 BP 跟哥们真刀真枪干，谁阵容没摆好当场红温 😂' },
    { color: C.green, av: 'B', name: '@FM老玩家', time: '20分钟前', text: '选人环节像王者 BP，摆位又跟实况一模一样，这就是为球迷量身定做的啊！' },
    { color: C.red, av: 'C', name: '@公司球队前锋', time: '1小时前', text: '等位的时候掏出手机和同事来一局，6 位房间码太方便，已经上了 MVP 🏆' },
  ];

  quotes.forEach((q, i) => {
    const y = 3.4 + i * 2;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.6, y, w: 7.45, h: 1.75, fill: { color: ALPHA.glass }, line: { type: 'none' }, rectRadius: 0.1
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 0.6, y, w: 0.08, h: 1.75, fill: { color: q.color }, line: { type: 'none' }
    });
    s.addText('"', {
      x: 0.8, y: y - 0.15, w: 0.5, h: 0.6,
      fontSize: 50, color: ALPHA.faint, bold: true, fontFace: 'Georgia'
    });
    s.addText(q.text, {
      x: 0.95, y: y + 0.15, w: 7, h: 0.9,
      fontSize: 14, color: 'FFFFFF', bold: true, fontFace: FONT_CN, lineSpacingMultiple: 1.3
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: 1.05, y: y + 1.15, w: 0.4, h: 0.4, fill: { color: C.green }, line: { type: 'none' }
    });
    s.addText(q.av, {
      x: 1.05, y: y + 1.15, w: 0.4, h: 0.4,
      fontSize: 14, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', fontFace: FONT_EN
    });
    s.addText(q.name, {
      x: 1.55, y: y + 1.18, w: 3, h: 0.3,
      fontSize: 13, color: q.color, bold: true, fontFace: FONT_CN
    });
    s.addText(q.time, {
      x: 5.5, y: y + 1.18, w: 2.4, h: 0.3,
      fontSize: 11, color: ALPHA.dim, align: 'right', fontFace: FONT_CN
    });
  });

  s.addShape(pptx.ShapeType.roundRect, {
    x: 2.4, y: 9.85, w: 3.8, h: 0.8, fill: { color: C.gold }, line: { type: 'none' }, rectRadius: 0.4
  });
  s.addText('⚽ 我 也 要 玩', {
    x: 2.4, y: 9.85, w: 3.8, h: 0.8,
    fontSize: 22, color: '1A0C02', bold: true, align: 'center', valign: 'middle', fontFace: FONT_CN, charSpacing: 4
  });

  s.addText('小红书搜索「绿茵禁选对决」 · 浏览器开黑无需下载', {
    x: 0, y: 10.75, w: 8.625, h: 0.4,
    fontSize: 13, color: ALPHA.soft, align: 'center', fontFace: FONT_CN
  });
}

const outFile = `${outDir}/Football-BP-Arena-Xiaohongshu-Posters.pptx`;
await pptx.writeFile({ fileName: outFile });
console.log(`[OK] Generated: ${outFile}`);
console.log(`[INFO] Size: 8.625" x 11.5" (1242 x 1660 px · Xiaohongshu 3:4)`);
console.log(`[INFO] Slides: 5`);
