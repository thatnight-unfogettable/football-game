# 🏆 绿茵禁选对决 - 在线部署指南

你的足球BP游戏已经有完整的在线对战功能！按照以下步骤部署到云端，让好友一起玩。

---

## 📋 前提条件

- GitHub 账号
- [Node.js 20+](https://nodejs.org/) 已安装

---

## 🚀 方案一：Render 部署（推荐 - 免费）

### 步骤 1: 创建 GitHub 仓库

```bash
# 在 GitHub 上创建新仓库，例如: football-bp-arena
# 然后在本项目文件夹执行:

cd "c:\Users\29576\Desktop\足球游戏"
git init
git add .
git commit -m "Initial commit - Football BP Arena"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/football-bp-arena.git
git push -u origin main
```

### 步骤 2: 部署到 Render

1. 访问 [render.com](https://render.com) 并登录
2. 点击 **New +** → **Blueprint**
3. 连接你的 GitHub 仓库
4. Render 会自动读取 `render.yaml` 配置
5. 点击 **Apply**

> **注意**: Render 免费版服务会在 15 分钟无活动后休眠，首次加载可能需要 30-60 秒。

### 步骤 3: 自定义域名（可选）

1. 在 Render 控制台 → 你的服务 → **Settings**
2. 添加自定义域名
3. 配置 DNS 指向 Render

---

## 🌐 方案二：Railway 部署（适合更多流量）

### 步骤 1: 安装 Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 步骤 2: 部署

```bash
cd "c:\Users\29576\Desktop\足球游戏"
railway init
railway up
```

Railway 会自动检测 Node.js 项目并部署。

---

## 💻 本地测试

在本地测试服务器：

```bash
cd "c:\Users\29576\Desktop\足球游戏"
npm start
```

然后打开浏览器访问 http://localhost:3000

---

## 🔧 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | 3000 |
| `ALLOWED_ORIGINS` | 允许的域名（逗号分隔） | `*`（全部允许）|

### WebSocket 端点

- 开发环境: `ws://localhost:3000/ws`
- 生产环境: `wss://your-domain.com/ws`

---

## 🎮 使用方法

### 创建房间

1. 点击 **好友在线对战**
2. 输入昵称
3. 点击 **创建房间**
4. 复制 6 位房间码或邀请链接发送给好友

### 加入房间

1. 点击 **好友在线对战**
2. 输入昵称
3. 输入 6 位房间码
4. 点击 **加入房间**

---

## 🔒 安全设置

如果需要限制只能从你的域名访问：

```bash
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com npm start
```

---

## 📊 限制说明

| 项目 | 限制 |
|------|------|
| 同时在线房间 | 无限制 |
| 每房间玩家 | 2 人 |
| 消息频率 | 每 5 秒最多 20 条 |
| 房间存活时间 | 空闲 10 分钟或比赛结束 5 分钟后自动删除 |

---

## ❓ 常见问题

### Q: 好友无法连接？
- 确认服务器已正确部署并运行
- 检查防火墙设置
- 确认使用正确的 URL（http vs https）

### Q: WebSocket 连接失败？
- 确保 `wss://`（生产环境）或 `ws://`（开发环境）配置正确
- 检查浏览器控制台是否有 CORS 错误

### Q: 如何更新游戏？
- 更新代码后推送到 GitHub
- Render 会自动重新部署

---

## 📁 项目结构

```
足球游戏/
├── index.html          # 主页面
├── server/
│   ├── server.js       # 开发服务器
│   └── render.js       # 生产服务器
├── src/
│   ├── app.js          # 前端应用
│   ├── online.js       # 在线对战客户端
│   └── game.js         # 游戏引擎
├── data/
│   └── players.js      # 球员数据
├── assets/
│   └── styles.css      # 样式
└── package.json
```

---

祝你玩得开心！⚽
