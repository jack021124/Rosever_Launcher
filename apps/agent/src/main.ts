/**
 * Rosever Agent —— 服务器端常驻守护进程
 *
 * 职责：
 *   1. 监听 WebSocket（默认 ws://，配置 tlsCert/tlsKey 后切 wss://）
 *   2. Token 认证 + 可选 IP 白名单
 *   3. 复用 shared 的 ProcessManager 拉起/守护 5 个 .exe
 *   4. 转发 launcher 的 RPC 请求给 ConfStore / DbManager / ToolRunner
 *   5. 把进程状态/日志实时推送给所有已认证连接
 *   6. SIGINT/SIGTERM 优雅退出（停所有服务）
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { ProcessManager, DbManager } from '@rosever/shared';
import type {
  HelloMsg,
  RpcRequest,
  RpcResult,
  WelcomeMsg,
  StatusDeltaMsg,
  StatusSnapshotMsg,
  LogStreamMsg,
  ByeMsg,
  ServiceStatus,
  LogEntry,
  MysqlConfig,
} from '@rosever/shared';
import { loadConfig, validateConfig, type AgentConfig } from './config.js';
import { buildDispatcher, AGENT_VERSION } from './rpcDispatcher.js';

/** 单个客户端连接的状态 */
interface ClientState {
  ws: WebSocket;
  /** 是否已通过 Token 认证 */
  authenticated: boolean;
  /** hello 超时定时器 */
  helloTimer?: NodeJS.Timeout;
  /** 客户端 IP（用于白名单） */
  ip: string;
}

const HELLO_TIMEOUT_MS = 5000;

/** 已认证连接集合（模块级，main 与 onMessage 共享） */
const clients = new Set<ClientState>();

function main() {
  const cfg = loadConfig();

  // ---- banner ----
  console.log('================================================');
  console.log(`  Rosever Agent  v${AGENT_VERSION}`);
  console.log('================================================');
  console.log(`  服务端目录 : ${cfg.serverRoot}`);
  console.log(`  监听端口   : ${cfg.port}  (${cfg.tlsCert ? 'wss' : 'ws'})`);
  console.log(`  Token      : ${cfg.token.slice(0, 4)}${'*'.repeat(Math.max(0, cfg.token.length - 4))}`);
  if (cfg.allowedIps && cfg.allowedIps.length > 0) {
    console.log(`  IP 白名单  : ${cfg.allowedIps.join(', ')}`);
  }
  console.log('------------------------------------------------');

  // ---- 配置校验 ----
  const errs = validateConfig(cfg);
  if (errs.length > 0) {
    console.error('  ✗ 配置错误：');
    for (const e of errs) console.error(`    - ${e}`);
    console.error('\n  请编辑 agent.json 后重试。');
    console.log('================================================');
    process.exit(1);
  }

  // ---- 进程管理器（单例）----
  const pm = new ProcessManager(cfg.serverRoot);
  const dispatcher = buildDispatcher({ pm, serverRoot: cfg.serverRoot });

  /** 推送一条消息给所有已认证客户端 */
  function broadcast(msg: object) {
    const data = JSON.stringify(msg);
    for (const c of clients) {
      if (c.authenticated && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(data);
      }
    }
  }

  /** 推送单个服务状态变化 */
  pm.onStatus((status: ServiceStatus) => {
    const msg: StatusDeltaMsg = { type: 'status', status };
    broadcast(msg);
  });
  /** 推送单条日志 */
  pm.onLog((entry: LogEntry) => {
    const msg: LogStreamMsg = { type: 'log', entry };
    broadcast(msg);
  });

  // ---- 构建 HTTP/HTTPS server（wss 支持）----
  let server: http.Server | https.Server;
  if (cfg.tlsCert && cfg.tlsKey && fs.existsSync(cfg.tlsCert) && fs.existsSync(cfg.tlsKey)) {
    server = https.createServer({
      cert: fs.readFileSync(cfg.tlsCert),
      key: fs.readFileSync(cfg.tlsKey),
    });
    console.log('  TLS 已启用（wss://）');
  } else {
    server = http.createServer();
  }

  // ---- WebSocket Server ----
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const ip = getClientIp(req);
    const client: ClientState = { ws, authenticated: false, ip };

    // IP 白名单
    if (cfg.allowedIps && cfg.allowedIps.length > 0 && !cfg.allowedIps.includes(ip)) {
      const bye: ByeMsg = { type: 'bye', reason: 'IP 不在白名单' };
      ws.send(JSON.stringify(bye));
      ws.close(4001, 'ip not allowed');
      console.log(`[拒绝] ${ip} 不在白名单`);
      return;
    }

    // hello 超时
    client.helloTimer = setTimeout(() => {
      if (!client.authenticated) {
        const bye: ByeMsg = { type: 'bye', reason: '认证超时' };
        try { ws.send(JSON.stringify(bye)); } catch { /* ignore */ }
        ws.close(4002, 'hello timeout');
      }
    }, HELLO_TIMEOUT_MS);

    ws.on('message', (raw) => onMessage(client, cfg, dispatcher, raw, pm));
    ws.on('close', () => {
      if (client.helloTimer) clearTimeout(client.helloTimer);
      clients.delete(client);
      console.log(`[断开] ${ip}（当前连接：${clients.size}）`);
    });
    ws.on('error', () => {
      /* 单连接错误吞掉，close 会随之触发 */
    });

    console.log(`[连接] ${ip} 等待认证…`);
  });

  server.listen(cfg.port, '0.0.0.0', () => {
    console.log(`\n  ▶ Agent 已就绪，等待 Launcher 连接…`);
    console.log(`    连接地址: ${cfg.tlsCert ? 'wss' : 'ws'}://<服务器IP>:${cfg.port}`);
    console.log('================================================');
  });

  // ---- 优雅退出 ----
  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n收到 ${sig}，正在关闭…`);

    // 通知所有客户端
    const bye: ByeMsg = { type: 'bye', reason: 'Agent 关闭' };
    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        try { c.ws.send(JSON.stringify(bye)); } catch { /* ignore */ }
      }
    }
    // 停所有服务
    console.log('  正在停止全部服务进程…');
    pm.dispose();

    server.close(() => {
      console.log('  已退出。');
      process.exit(0);
    });
    // 强制兜底（5 秒后还没退就强杀）
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * 处理一条客户端消息
 */
async function onMessage(
  client: ClientState,
  cfg: AgentConfig,
  dispatcher: Map<string, (args: unknown[]) => unknown>,
  raw: { toString: () => string },
  pm: ProcessManager,
) {
  let msg: unknown;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return; // 非 JSON，丢弃
  }

  // 未认证：只接受 hello
  if (!client.authenticated) {
    if ((msg as HelloMsg)?.type === 'hello') {
      handleHello(client, cfg, msg as HelloMsg, pm);
    }
    return;
  }

  // 已认证：只接受 rpc
  const req = msg as RpcRequest;
  if (req?.type !== 'rpc' || typeof req.id !== 'number' || typeof req.method !== 'string') {
    return;
  }

  // 分发
  const handler = dispatcher.get(req.method);
  if (!handler) {
    const res: RpcResult = {
      type: 'rpc.result',
      id: req.id,
      ok: false,
      error: `未知方法: ${req.method}`,
    };
    client.ws.send(JSON.stringify(res));
    return;
  }

  try {
    const result = await handler(req.args ?? []);
    const res: RpcResult = { type: 'rpc.result', id: req.id, ok: true, result };
    client.ws.send(JSON.stringify(res));
  } catch (err) {
    const res: RpcResult = {
      type: 'rpc.result',
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    client.ws.send(JSON.stringify(res));
  }
}

/**
 * 处理 hello 认证
 */
function handleHello(
  client: ClientState,
  cfg: AgentConfig,
  hello: HelloMsg,
  pm: ProcessManager,
) {
  if (client.helloTimer) {
    clearTimeout(client.helloTimer);
    client.helloTimer = undefined;
  }

  // Token 校验
  if (hello.token !== cfg.token) {
    const bye: ByeMsg = { type: 'bye', reason: 'Token 错误' };
    try { client.ws.send(JSON.stringify(bye)); } catch { /* ignore */ }
    client.ws.close(4003, 'bad token');
    console.log(`[拒绝] ${client.ip} Token 错误`);
    return;
  }

  client.authenticated = true;
  clients.add(client);

  // 回送 welcome（MySQL 配置，密码置空）
  let dbConfig: MysqlConfig;
  try {
    dbConfig = new DbManager(cfg.serverRoot).readConfig();
    dbConfig = { ...dbConfig, password: '' }; // 不回传密码
  } catch {
    dbConfig = { host: '127.0.0.1', port: 3306, user: 'ragnarok', password: '', database: 'ragnarok' };
  }

  const welcome: WelcomeMsg = {
    type: 'welcome',
    agentVersion: AGENT_VERSION,
    serverRoot: cfg.serverRoot,
    dbConfig,
  };
  client.ws.send(JSON.stringify(welcome));

  // 紧接着推送全量状态快照
  const snapshot: StatusSnapshotMsg = {
    type: 'status.snapshot',
    services: pm.getAllStatus(),
  };
  client.ws.send(JSON.stringify(snapshot));

  console.log(`[认证] ${client.ip} 通过（客户端版本 ${hello.clientVersion}）`);
}

/** 从 req 取客户端 IP（兼容反代） */
function getClientIp(req: http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? 'unknown';
}

main();
