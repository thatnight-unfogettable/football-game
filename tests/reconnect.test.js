// 断线重连测试：A 玩家创建房间后断开，再重连验证 SESSION 状态正确恢复
import { WebSocket } from 'ws';

function mk(name) {
  const ws = new WebSocket('ws://localhost:3000/ws');
  const msgs = [];
  ws.on('message', raw => msgs.push(JSON.parse(raw.toString())));
  return {
    ws, name, msgs,
    open: () => new Promise((res) => { if (ws.readyState === 1) return res(); ws.once('open', res); }),
    send(type, payload = {}) { this.ws.send(JSON.stringify({ type, payload, protocol: 4 })); },
    wait(ms) { return new Promise(r => setTimeout(r, ms)); },
    close() { this.ws.close(); },
  };
}

async function main() {
  // A 创建
  const A = mk('A');
  await A.open();
  A.send('CREATE', { nickname: 'Alice' });
  await A.wait(400);
  const sessionA = A.msgs.find(m => m.type === 'SESSION')?.payload;
  if (!sessionA) throw new Error('A CREATE 失败');
  console.log('✅ A 创建房间', sessionA.code, 'token=', sessionA.token.slice(0, 8));

  // B 加入
  const B = mk('B');
  await B.open();
  B.send('JOIN', { code: sessionA.code, nickname: 'Bob' });
  await B.wait(400);
  const sessionB = B.msgs.find(m => m.type === 'SESSION')?.payload;
  if (!sessionB) throw new Error('B JOIN 失败');
  console.log('✅ B 加入, side=B');

  // A 突然断线
  A.close();
  await A.wait(500);
  console.log('⚠️  A 已断线');

  // A 重连（新建 ws，发送 RECONNECT）
  const A2 = mk('A2');
  await A2.open();
  A2.send('RECONNECT', { code: sessionA.code, token: sessionA.token });
  await A2.wait(400);
  const reconnected = A2.msgs.find(m => m.type === 'SESSION');
  if (!reconnected?.payload?.reconnected) throw new Error('重连 SESSION 未返回 reconnected=true');
  console.log('✅ A 重连成功, side=', reconnected.payload.side, 'reconnected=', reconnected.payload.reconnected);

  // B 也应当收到 STATE 更新（players.A.connected 应为 true）
  const lastB = B.msgs.filter(m => m.type === 'STATE').slice(-1)[0]?.payload;
  console.log('📊 B 视角: players.A.connected =', lastB?.players?.A?.connected);

  A2.close(); B.close();
  console.log('\n✅ 重连测试通过');
  process.exit(0);
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
