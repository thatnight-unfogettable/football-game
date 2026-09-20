// 验证：ws 服务器不可达时，UI 应显示错误提示而不是卡住
// 关闭服务器后调用 client.connect()
import { WebSocket } from 'ws';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><div id=app></div>', {
  url: 'http://localhost:3100/',
  pretendToBeVisual: true,
});
const { window } = dom;
window.WebSocket = WebSocket;
globalThis.WebSocket = WebSocket;
globalThis.location = window.location;

const { OnlineClient } = await import('../src/online.js');

let connectError = null;
let connectTime = Date.now();
const client = new OnlineClient({
  session: () => {},
  state: () => {},
  error: (m) => console.log('[error]', m),
  close: () => {},
});

try {
  await client.connect();
  console.log('❌ 不应该成功');
} catch (e) {
  connectError = e.message || String(e);
  console.log(`✅ 抛出错误: "${connectError}" (耗时 ${Date.now() - connectTime}ms)`);
  if (Date.now() - connectTime > 3000) console.log('❌ 错误抛出太慢（>3s）');
}

process.exit(connectError && Date.now() - connectTime < 3000 ? 0 : 1);
