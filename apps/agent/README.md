# Rosever Agent

服务器端常驻守护进程。Launcher 通过 WebSocket 连接到它，远程控制 BetterRA/rAthena 服务端的进程、配置、数据库、工具。

## 工作方式

```
[你的电脑: Launcher]  ──WebSocket──>  [服务器: Agent]  ──>  login/char/map/web/websocket.exe
                       Token 认证                       └──>  MySQL / conf / 工具
```

Agent 复用 Launcher 端的全部业务逻辑（进程守护、conf GBK 解析、数据库操作），只是把 IPC 换成了 WebSocket RPC。

## 1. 打包

在开发机（有项目源码的地方）执行：

```bash
# 在项目根目录
npm install
npm run build:shared
npm run build --workspace @rosever/agent
```

产物：`apps/agent/dist/agent.cjs`（约 700KB 单文件，含 ws/iconv-lite；mysql2 保留为外部依赖）。

## 2. 部署到服务器

服务器需要：
- **Node.js ≥ 20**
- **mysql2 包**（数据库功能需要；只用进程/conf 控制可省略）
  ```bash
  # 在服务器任一目录
  npm init -y
  npm install mysql2
  ```

把以下两个文件拷到服务器同一目录：
- `agent.cjs`（打包产物）
- `agent.json`（配置文件，见下）

## 3. 配置 agent.json

复制 `agent.json.example` 为 `agent.json`，按需修改：

```json
{
  "port": 7890,
  "token": "改成你自己的长随机串_例如_a8f3k2j9d7",
  "serverRoot": "C:/BetterRA_Done_Dev",
  "tlsCert": "",
  "tlsKey": "",
  "allowedIps": []
}
```

| 字段 | 说明 |
|---|---|
| `port` | WebSocket 监听端口，默认 7890 |
| `token` | **必须修改**。和 Launcher 端填的 Token 必须一致。建议 32+ 位随机串 |
| `serverRoot` | BetterRA 服务端的**绝对路径**（包含 *.exe 和 conf/ 的目录） |
| `tlsCert` / `tlsKey` | 可选。配置后启用 wss 加密传输。留空则用明文 ws |
| `allowedIps` | 可选 IP 白名单。空数组 = 不限制 |

> 所有字段都可以用环境变量覆盖：`ROSEVER_PORT` / `ROSEVER_TOKEN` / `ROSEVER_SERVER_ROOT` / `ROSEVER_TLS_CERT` / `ROSEVER_TLS_KEY` / `ROSEVER_ALLOWED_IPS`（逗号分隔）

**Token 生成建议**（任选一个）：
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
openssl rand -hex 24
```

## 4. 启动

```bash
node agent.cjs
```

看到下面的输出就说明启动成功：

```
================================================
  Rosever Agent  v0.1.0
================================================
  服务端目录 : C:/BetterRA_Done_Dev
  监听端口   : 7890  (ws)
  Token      : a8f3****************
------------------------------------------------

  ▶ Agent 已就绪，等待 Launcher 连接…
    连接地址: ws://<服务器IP>:7890
================================================
```

## 5. 防火墙

开放服务器的 `port`（默认 7890）端口，给 Launcher 所在机器访问。

Windows Server：
```powershell
New-NetFirewallRule -DisplayName "Rosever Agent" -Direction Inbound -LocalPort 7890 -Protocol TCP -Action Allow
```

## 6. Launcher 端连接

1. 打开 Launcher
2. 顶部「目标」栏点 **+ 添加**
3. 填写：名称 / IP 或域名 / 端口（7890）/ Token（与 agent.json 一致）
4. 点添加后，点击该服务器条目即可切换到远程模式
5. 状态指示：绿点 = 已连接 / 黄点闪烁 = 连接中 / 灰点 = 断开 / 红点 = Token 或 IP 被拒

切换后，服务控制 / 配置 / 数据库 / 工具页面的所有操作都会走远程 Agent。

## 7. 常驻运行（可选）

Agent 默认前台运行，关掉控制台就停了。要常驻：

**Windows（推荐 nssm）：**
```bash
# 下载 nssm 后
nssm install RoseverAgent "C:\path\to\node.exe" "C:\path\to\agent.cjs"
nssm set RoseverAgent AppDirectory "C:\path\to\agent\dir"
nssm start RoseverAgent
```

**Linux（pm2/systemd）：**
```bash
pm2 start agent.cjs --name rosever-agent
pm2 save && pm2 startup
```

## 8. 远程模式语义说明

| 操作 | 本地行为 | 远程行为 |
|---|---|---|
| 服务控制 | 直接 spawn 本地 exe | 通过 Agent spawn 服务器上的 exe |
| 配置编辑 | 读写本地 conf | 通过 Agent 读写服务器 conf（GBK 处理一致） |
| 数据库 | 用 Launcher 端 MySQL 配置 | **Agent 自己从 inter_athena.conf 读配置**，Launcher 不传密码 |
| 数据库备份 | 弹保存框选位置 | 备份到服务器 `serverRoot/.backup/db/` 下 |
| 更换目录 | 弹文件夹选择框 | **不支持**（远程 serverRoot 由 agent.json 固定） |
| 工具运行 | 本地 exe | 服务器上的 exe |

## 安全注意

- **Token 是唯一防线**（ws 明文模式下）。务必用强 Token，不要用弱口令
- 生产环境强烈建议配置 `tlsCert`/`tlsKey` 启用 wss，或配合反向代理（nginx + TLS）做终止
- `allowedIps` 是额外的 IP 白名单保护
- Agent 进程的权限 = 启动它的用户权限。建议用普通用户跑，不要用 root/Administrator
