# Rosever

RO (BetterRA / rAthena) 服务端启动器与远程管理桌面端。

## 结构

```
rosever/
├─ apps/
│  ├─ launcher/   # 本地启动器 (Electron + React + TS + Tailwind)
│  └─ agent/      # 服务器端 Agent (常驻守护进程, WebSocket)
└─ packages/
   └─ shared/     # 共享代码 (类型 / 协议 / 进程管理 / conf 解析)
```

## 开发

```bash
npm install          # 安装全部依赖 (npm workspaces)
npm run dev          # 启动 launcher 开发模式
npm run build        # 构建全部
```

## 技术栈

- Electron + electron-vite + React + TypeScript
- Tailwind CSS v4
- 共享 monorepo：launcher 与 agent 复用进程管理 / conf 解析逻辑
