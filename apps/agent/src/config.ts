/**
 * Agent 配置加载
 *
 * 优先级：环境变量 > agent.json > 默认值
 *
 * agent.json 放在 Agent 进程工作目录（与 agent.js / src/main.ts 同级），示例：
 * {
 *   "port": 7890,
 *   "token": "改成你自己的长随机串",
 *   "serverRoot": "C:/BetterRA_Done_Dev",
 *   "tlsCert": "",     // 可选，配置后启用 wss
 *   "tlsKey": "",
 *   "allowedIps": []   // 可选，留空则不限制
 * }
 */
import fs from 'node:fs';
import path from 'node:path';

export interface AgentConfig {
  /** WebSocket 监听端口 */
  port: number;
  /** 配对 Token（launcher 必须带同样的值） */
  token: string;
  /** 服务端根目录（BetterRA_Done_Dev 的绝对路径） */
  serverRoot: string;
  /** TLS 证书路径（可选，配置后启用 wss） */
  tlsCert?: string;
  tlsKey?: string;
  /** 允许连接的客户端 IP 白名单（可选，空/缺省 = 不限） */
  allowedIps?: string[];
}

export const DEFAULT_CONFIG: AgentConfig = {
  port: 7890,
  token: 'CHANGE_ME',
  serverRoot: '.',
};

/**
 * 解析一个字符串为整数；非法时返回 undefined
 */
function parseIntSafe(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 解析 allowedIps 字符串（逗号分隔）为数组
 */
function parseIpList(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * 从 agent.json 读取配置（找不到返回空对象，不抛错）
 */
function readJsonFile(file: string): Partial<AgentConfig> {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as Partial<AgentConfig>;
  } catch {
    return {};
  }
}

/**
 * 加载配置：环境变量 > agent.json > 默认值
 *
 * 环境变量：ROSEVER_PORT / ROSEVER_TOKEN / ROSEVER_SERVER_ROOT
 *          ROSEVER_TLS_CERT / ROSEVER_TLS_KEY / ROSEVER_ALLOWED_IPS
 */
export function loadConfig(configFile?: string): AgentConfig {
  const file = configFile ?? path.resolve(process.cwd(), 'agent.json');
  const fromFile = readJsonFile(file);

  const env = process.env;
  const port = parseIntSafe(env.ROSEVER_PORT) ?? fromFile.port ?? DEFAULT_CONFIG.port;
  const token = env.ROSEVER_TOKEN ?? fromFile.token ?? DEFAULT_CONFIG.token;
  const serverRoot = env.ROSEVER_SERVER_ROOT ?? fromFile.serverRoot ?? DEFAULT_CONFIG.serverRoot;
  const tlsCert = env.ROSEVER_TLS_CERT ?? fromFile.tlsCert;
  const tlsKey = env.ROSEVER_TLS_KEY ?? fromFile.tlsKey;
  const allowedIps = parseIpList(env.ROSEVER_ALLOWED_IPS) ?? fromFile.allowedIps;

  const cfg: AgentConfig = {
    port,
    token,
    serverRoot: path.resolve(serverRoot),
  };
  if (tlsCert) cfg.tlsCert = tlsCert;
  if (tlsKey) cfg.tlsKey = tlsKey;
  if (allowedIps && allowedIps.length > 0) cfg.allowedIps = allowedIps;
  return cfg;
}

/**
 * 校验配置是否可用；返回错误信息数组（空 = OK）
 */
export function validateConfig(cfg: AgentConfig): string[] {
  const errs: string[] = [];
  if (!cfg.token || cfg.token === 'CHANGE_ME') {
    errs.push('token 未设置（请在 agent.json 中配置一个随机 token）');
  }
  if (!fs.existsSync(cfg.serverRoot)) {
    errs.push(`serverRoot 目录不存在: ${cfg.serverRoot}`);
  }
  if (cfg.tlsCert && !fs.existsSync(cfg.tlsCert)) {
    errs.push(`tlsCert 文件不存在: ${cfg.tlsCert}`);
  }
  if (cfg.tlsKey && !fs.existsSync(cfg.tlsKey)) {
    errs.push(`tlsKey 文件不存在: ${cfg.tlsKey}`);
  }
  return errs;
}
