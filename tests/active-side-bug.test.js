// 验证 activeSide 在三选轮 PICK 阶段的轮换是否正确
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGameState,
  applyOrder,
  applyPrePick,
  applyBan,
  applyPostPick,
  activeSide,
} from '../src/engine.js';

test('三选轮 PICK 阶段 activeSide 正确轮换（先手 A）', () => {
  const game = newGameState({ difficulty: 'normal', personality: 'power' });
  game.round = 2; // triple round
  assert.equal(applyOrder(game, 'A', 'first').ok, true);
  // 三选轮：BAN → PICK（无 PRE_PICK）
  assert.equal(applyBan(game, 'B', game.candidates[0]).ok, true);
  assert.equal(applyBan(game, 'A', game.candidates[1]).ok, true);
  assert.equal(applyBan(game, 'B', game.candidates[2]).ok, true);
  assert.equal(game.phase, 'PICK');
  assert.equal(activeSide(game), 'A', 'taken=0 应轮到 A');
  assert.equal(applyPostPick(game, 'A', game.candidates[3]).ok, true);
  assert.equal(activeSide(game), 'B', 'taken=1 应轮到 B');
  assert.equal(applyPostPick(game, 'B', game.candidates[4]).ok, true);
  assert.equal(activeSide(game), 'A', 'taken=2 应轮到 A（修复点）');
  assert.equal(applyPostPick(game, 'A', game.candidates[5]).ok, true);
  assert.equal(activeSide(game), 'B', 'taken=3 应轮到 B');
  assert.equal(applyPostPick(game, 'B', game.candidates[6]).ok, true);
  assert.equal(game.phase, 'ROUND_END');
});

test('三选轮 PICK 阶段 activeSide 正确轮换（先手 B）', () => {
  const game = newGameState({ difficulty: 'normal', personality: 'power' });
  game.round = 2;
  assert.equal(applyOrder(game, 'B', 'first').ok, true);
  // firstBan = A（firstPicker=B 的对家）
  assert.equal(applyBan(game, 'A', game.candidates[0]).ok, true);
  assert.equal(applyBan(game, 'B', game.candidates[1]).ok, true);
  assert.equal(applyBan(game, 'A', game.candidates[2]).ok, true);
  assert.equal(game.phase, 'PICK');
  assert.equal(activeSide(game), 'B', 'taken=0 应轮到 B');
  assert.equal(applyPostPick(game, 'B', game.candidates[3]).ok, true);
  assert.equal(activeSide(game), 'A', 'taken=1 应轮到 A');
  assert.equal(applyPostPick(game, 'A', game.candidates[4]).ok, true);
  assert.equal(activeSide(game), 'B', 'taken=2 应轮到 B（修复点）');
  assert.equal(applyPostPick(game, 'B', game.candidates[5]).ok, true);
  assert.equal(activeSide(game), 'A', 'taken=3 应轮到 A');
  assert.equal(applyPostPick(game, 'A', game.candidates[6]).ok, true);
  assert.equal(game.phase, 'ROUND_END');
});

test('修复后：先手方第 2 次点击不再被服务端拒绝', () => {
  const game = newGameState({ difficulty: 'normal', personality: 'power' });
  game.round = 2;
  assert.equal(applyOrder(game, 'A', 'first').ok, true);
  assert.equal(applyBan(game, 'B', game.candidates[0]).ok, true);
  assert.equal(applyBan(game, 'A', game.candidates[1]).ok, true);
  assert.equal(applyBan(game, 'B', game.candidates[2]).ok, true);
  // 模拟先手 A 选 2 次、对家 B 选 2 次都成功
  assert.equal(applyPostPick(game, 'A', game.candidates[3]).ok, true);
  assert.equal(applyPostPick(game, 'B', game.candidates[4]).ok, true);
  // 关键点：taken=2 时应轮到 A，原 bug 会让 A 的第二次选择被拒绝
  assert.equal(activeSide(game), 'A');
  const r = applyPostPick(game, 'A', game.candidates[5]);
  assert.equal(r.ok, true, '先手 A 的第二次选择必须成功，实际错误：' + r.error);
});
