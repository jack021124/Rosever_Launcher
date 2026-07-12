/**
 * Launcher <-> Agent WebSocket 消息协议
 *
 * 设计：通用 RPC 壳 + 认证握手 + 服务端推送。
 *   - 请求/响应用 { type:'rpc' / 'rpc.result', id } 配对，支持并发
 *   - method 字段直接复用 launcher 的 IPC channel 名（'service:start' 等），
 *     Agent 端路由表极薄
 *   - 服务端推送（status/log）走单独 type，单向
 *
 * method 取值 = launcher IPC channel 名全集：
 *   app:version / config:getServerRoot / config:pickServerRoot
 *   service:getStatus / service:start / service:stop / service:restart
 *   service:startAll / service:stopAll
 *   conf:read / conf:save
 *   db:getConfig / db:test / db:initialize / db:listTables / db:queryTable
 *   db:listAccounts / db:createAccount / db:deleteAccount / db:setGroup
 *   db:setPassword / db:setBan / db:listChars / db:setZeny / db:deleteChar
 *   db:onlinePlayers / db:importSql / db:backup
 *   tool:list / tool:run
 *
 * 注意（远程模式语义）：
 *   - db:* 的 cfg 参数由 Agent 自己从 inter_athena.conf 读取，launcher 传的 cfg 被忽略
 *   - config:pickServerRoot 远程不支持（返回错误）
 *   - db:backup 备份到 Agent 端 serverRoot/.backup/db/ 下，返回路径
 */
import type { ServiceStatus, LogEntry, MysqlConfig } from './types.js';

// ==================== 认证握手 ====================

/** Launcher -> Agent：首条消息，携带 Token */
export interface HelloMsg {
  type: 'hello';
  token: string;
  clientVersion: string;
}

/** Agent -> Launcher：认证通过后回送 */
export interface WelcomeMsg {
  type: 'welcome';
  agentVersion: string;
  /** Agent 端的服务端根目录（只读） */
  serverRoot: string;
  /** Agent 从 inter_athena.conf 读到的 MySQL 配置（password 置空，仅展示） */
  dbConfig: MysqlConfig;
}

// ==================== RPC 请求 / 响应 ====================

/** Launcher -> Agent：RPC 请求壳 */
export interface RpcRequest {
  type: 'rpc';
  /** 单调递增 id，用于配对响应 */
  id: number;
  /** IPC channel 名，如 'service:start' */
  method: string;
  /** 原样转发给 Agent dispatcher 的参数数组 */
  args: unknown[];
}

/** Agent -> Launcher：RPC 响应壳 */
export interface RpcResult {
  type: 'rpc.result';
  /** 对应 RpcRequest.id */
  id: number;
  ok: boolean;
  /** 成功时的返回值（已序列化） */
  result?: unknown;
  /** 失败时的错误信息 */
  error?: string;
}

// ==================== 服务端推送（Agent -> Launcher） ====================

/** 单个服务状态变化推送（对应本地 service:status 通道） */
export interface StatusDeltaMsg {
  type: 'status';
  status: ServiceStatus;
}

/** 连接建立 / 首次认证后，全量快照所有服务状态 */
export interface StatusSnapshotMsg {
  type: 'status.snapshot';
  services: ServiceStatus[];
}

/** 单条日志推送（对应本地 service:log 通道） */
export interface LogStreamMsg {
  type: 'log';
  entry: LogEntry;
}

/** Agent 主动断开（如 Token 错误、即将重启） */
export interface ByeMsg {
  type: 'bye';
  reason: string;
}

/** 通用错误（非 RPC 范畴的协议级错误） */
export interface ErrorMsg {
  type: 'error';
  message: string;
}

// ==================== 联合类型 ====================

export type RequestMsg = HelloMsg | RpcRequest;

export type PushMsg =
  | WelcomeMsg
  | StatusDeltaMsg
  | StatusSnapshotMsg
  | LogStreamMsg
  | ByeMsg
  | ErrorMsg;

export type ResponseMsg = RpcResult | PushMsg;

export type AnyMsg = RequestMsg | ResponseMsg;

// ==================== 运行时类型守卫 ====================

export function isHello(m: unknown): m is HelloMsg {
  return (m as HelloMsg)?.type === 'hello';
}
export function isRpcRequest(m: unknown): m is RpcRequest {
  const r = m as RpcRequest;
  return r?.type === 'rpc' && typeof r.id === 'number' && typeof r.method === 'string';
}
export function isRpcResult(m: unknown): m is RpcResult {
  const r = m as RpcResult;
  return r?.type === 'rpc.result' && typeof r.id === 'number';
}

/** Agent 端 RPC 方法名枚举（仅用于类型安全，实际路由按字符串匹配） */
export type RpcMethod =
  | 'app:version'
  | 'config:getServerRoot'
  | 'config:pickServerRoot'
  | 'service:getStatus'
  | 'service:start'
  | 'service:stop'
  | 'service:restart'
  | 'service:startAll'
  | 'service:stopAll'
  | 'conf:read'
  | 'conf:save'
  | 'conf:saveText'
  | 'db:getConfig'
  | 'db:test'
  | 'db:initialize'
  | 'db:listTables'
  | 'db:queryTable'
  | 'db:listAccounts'
  | 'db:createAccount'
  | 'db:deleteAccount'
  | 'db:setGroup'
  | 'db:setPassword'
  | 'db:setBan'
  | 'db:listChars'
  | 'db:setZeny'
  | 'db:deleteChar'
  | 'db:onlinePlayers'
  | 'db:importSql'
  | 'db:backup'
  | 'tool:list'
  | 'tool:run';
