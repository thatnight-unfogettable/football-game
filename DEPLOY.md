# 🏆 绿茵禁选对决 - 部署指南

游戏包含两个独立组件，必须分别部署到合适的平台：

| 组件 | 用途 | 推荐平台 |
|------|------|----------|
| 前端静态文件（HTML/JS/CSS） | 渲染页面、跑游戏逻辑 | Vercel / Cloudflare Pages / Netlify |
| WebSocket 后端（Node.js + ws） | 联机房间、状态广播 | Render / Railway / Fly.io |

> ⚠️ **Vercel 不支持长连接 WebSocket**。单人 vs AI 在 Vercel 上能玩，但联机对战必须有一个单独的 WebSocket 服务器。

---

## 🚀 方案一：拆分部署（推荐）

适合已经部署到 Vercel，想补上联机功能的场景。

### 步骤 1：把后端部署到 Render

1. 登录 [render.com](https://render.com)，点 **New +** → **Web Service**
2. 连接 GitHub 仓库 `thatnight-unfogettable/football-game`
3. 填写：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server/server.js`
   - **Plan**: Free
4. 等部署完成，记下 Render 给的域名，例如 `football-bp-server.onrender.com`
5. （可选）在 Render 控制台 Environment 里加 `ALLOWED_ORIGINS=https://your-vercel-app.vercel.app` 收紧 CORS

> Render 免费版 15 分钟无活动会休眠，首次访问等待 30-60 秒唤醒。

### 步骤 2：让 Vercel 前端知道后端地址

打开 `index.html`，把第 9 行替换：

```html
window.WS_HOST = 'football-bp-server.onrender.com';
```

（不要带协议，只写主机名）

### 步骤 3：重新部署前端

推送到 GitHub，Vercel 自动重新部署。

### 完成

打开 Vercel 链接，进入"好友在线对战"，就能和好友用 6 位房间码联机了。

---

## 🚀 方案二：Render 一体化部署（最简单）

如果不想分开部署，直接全部扔 Render。

### 步骤 1

1. 登录 render.com → **New +** → **Web Service**
2. 连接 GitHub 仓库
3. **Build Command**: `npm install`
4. **Start Command**: `node server/server.js`
5. **Plan**: Free
6. 部署完成，`index.html` 里的 `window.WS_HOST` 保持为空即可（使用同源）

---

## 🌐 方案三：Cloudflare Pages / Netlify（仅前端）

如果你只想跑单人模式，可以用任何静态托管：

- **Cloudflare Pages**：连 GitHub，自动部署
- **Netlify**：同上
- **GitHub Pages**：需要自己设 Actions

这些平台都不支持 WebSocket 后端，联机用不了。

---

## 💻 本地测试

```bash
cd "c:\Users\29576\Desktop\足球游戏"
npm install
npm start
```

浏览器打开 http://localhost:3000

打开两个标签页测试联机：
- 标签 1：创建房间，记下 6 位房间码
- 标签 2：输入房间码加入

---

## 🔧 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | 3000 |
| `ALLOWED_ORIGINS` | 允许的域名（逗号分隔） | `*`（全部允许）|

### WebSocket 端点

- 开发环境：`ws://localhost:3000/ws`
- 生产环境：`wss://your-domain.com/ws`

前端通过 `index.html` 的 `window.WS_HOST` 控制：
- 留空 → 同源
- 填写主机名 → 跨域连到独立部署的 WebSocket 后端

---

## 📁 项目结构

```
足球游戏/
├── index.html          # 主页面（含 WS_HOST 配置）
├── server/
│   ├── server.js       # 主 WebSocket + 静态托管服务器
│   ├── render.js       # Render 专用版本
│   └── deploy.js       # 抽象部署层
├── src/
│   ├── app.js          # 前端应用（6 轮规则 vs AI）
│   ├── online.js       # 在线对战客户端（支持跨域 WS）
│   └── game.js         # 游戏引擎（保留老 10 轮规则）
├── data/
│   └── players.js      # 球员数据
├── assets/
│   └── styles.css      # 样式
└── package.json
```

---

## ❓ 常见问题

### Q: Vercel 上联机点击"创建房间"没反应？
检查浏览器 Console。WebSocket 连不上 → `WS_HOST` 没配对，或者 Render 后端没启动/已休眠。

### Q: 好友收到链接能进房，但房间一直等不到他？
确认双方都连到了同一个 WebSocket 后端（看在线大厅的"当前 WS 服务器"显示）。

### Q: Render 免费版休眠怎么办？
首次访问需等 30-60 秒，或升级到付费版（$7/月）。如果你担心，可以考虑 Fly.io（也支持 WebSocket）。

---

祝你玩得开心！⚽
