export const CONFIG = {
  seasonRounds: 38,
  startingCash: 80,
  weeklyActions: 3,
  maxActions: 6,
  marketSize: 12,
  listingWeeks: 2,
  saleRate: 1,
  saleFormMin: 0.8,
  saleFormMax: 1.2,
  defaultForm: 70,
  operatingRate: 0.05,
  fatigueRecovery: 8,
  fatiguePerMatch: 10,
  rotationRecovery: 2,
  maxFamiliarityBonus: 2,
  initialGradeMix: { A: 2, B: 11, C: 10 },
  initialPositionMix: { GK: 3, DEF: 8, MID: 8, FWD: 4 },
  playerForm: { min: 40, max: 100, neutral: 70, win: 5, draw: 1, loss: -4, starterBonus: 2, reserveRecovery: 1 },
  formations: {
    '4-4-2': { GK: 1, DEF: 4, MID: 4, FWD: 2, weights: { GK: .1, DEF: .3, MID: .3, FWD: .3 } },
    '4-3-3': { GK: 1, DEF: 4, MID: 3, FWD: 3, weights: { GK: .1, DEF: .3, MID: .25, FWD: .35 } },
    '4-2-3-1': { GK: 1, DEF: 4, MID: 5, FWD: 1, weights: { GK: .1, DEF: .3, MID: .4, FWD: .2 } }
  },
  gradeFloor: { E: 0, D: 40, C: 60, B: 75, A: 85, S: 90, SS: 95, SSS: 97 },
  nextGrade: { E: 'D', D: 'C', C: 'B', B: 'A', A: 'S', S: 'SS', SS: 'SSS', SSS: 'SSS' },
  gradeOrder: ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'E'],
  positionNames: { GK: '守门员', DEF: '后卫', MID: '中场', FWD: '前锋' },
  matchIncome: { home: 1.2, away: .6, win: .4, draw: .15 },
  sponsors: [
    { id: 'wins_12', title: '胜利伙伴', description: '赛季取得12场胜利', type: 'wins', target: 12, upfront: 4, reward: 14 },
    { id: 'top_10', title: '上半区计划', description: '赛季最终进入前10名', type: 'rank', target: 10, upfront: 5, reward: 16 },
    { id: 'rating_80', title: '球星工程', description: '首发有效实力达到80', type: 'power', target: 80, upfront: 3, reward: 12 },
    { id: 'goals_45', title: '进攻足球', description: '赛季打入45球', type: 'goals', target: 45, upfront: 4, reward: 15 },
    { id: 'trades_8', title: '转会达人', description: '完成8次买入或出售', type: 'trades', target: 8, upfront: 3, reward: 11 }
  ]
};

export function gradeFromRating(rating) {
  if (rating >= 97) return 'SSS';
  if (rating >= 95) return 'SS';
  if (rating >= 90) return 'S';
  if (rating >= 85) return 'A';
  if (rating >= 75) return 'B';
  if (rating >= 60) return 'C';
  if (rating >= 40) return 'D';
  return 'E';
}

export function playerValue(player) {
  const anchors = [[0,.2],[40,1],[60,4],[75,15],[85,50],[90,100],[95,170],[97,220],[100,320]];
  let value = anchors[0][1];
  for (let i = 1; i < anchors.length; i += 1) {
    const [score, amount] = anchors[i];
    const [prevScore, prevAmount] = anchors[i - 1];
    if (player.rating <= score) {
      value = prevAmount + (amount - prevAmount) * ((player.rating - prevScore) / (score - prevScore));
      break;
    }
    value = amount;
  }
  const multiplier = { GK: .85, DEF: .9, MID: 1, FWD: 1.05 }[player.position] || 1;
  return Math.max(.1, Math.round(value * multiplier * 10) / 10);
}
