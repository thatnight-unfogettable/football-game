// 正确复用 server.js 中已创建并已监听的 HTTP 服务器
import { server, rooms } from './server.js';

export { server, rooms };
