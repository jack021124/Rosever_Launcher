import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ServiceId, ServiceStatus, LogEntry, ConfFile, MysqlConfig } from '@rosever/shared';

/**
 * 暴露给渲染进程的安全 API。
 * 进程控制（P2）+ 目录配置 + 事件订阅 + 远程 target 切换（P4）。
 */

/** 远程连接状态（由 main 经 target:status 通道推送） */
export type TargetStatus =
  | { state: 'local' }
  | { state: 'connecting' | 'authenticating' | 'connected' | 'disconnected' | 'rejected' | 'bye'; detail?: string };

const api = {
  // 通用
  getVersion: () => ipcRenderer.invoke('app:version'),

  // 配置
  getServerRoot: () => ipcRenderer.invoke('config:getServerRoot'),
  pickServerRoot: () => ipcRenderer.invoke('config:pickServerRoot'),

  // 远程 target 切换（P4）：传入 target 让 main 建立/断开 WebSocket
  setTarget: (target: unknown) => ipcRenderer.invoke('target:set', target),
  /** 一次性测试某个远程 target 是否可达（不影响当前连接） */
  testTarget: (t: { host: string; port: number; token: string }) =>
    ipcRenderer.invoke('target:test', t) as Promise<{ ok: boolean; agentVersion?: string; serverRoot?: string; error?: string }>,
  /** 订阅远程连接状态推送 */
  onTargetStatus: (cb: (s: TargetStatus) => void) => {
    const handler = (_e: IpcRendererEvent, s: TargetStatus) => cb(s);
    ipcRenderer.on('target:status', handler);
    return () => ipcRenderer.removeListener('target:status', handler);
  },

  // 进程控制
  getStatus: () => ipcRenderer.invoke('service:getStatus') as Promise<ServiceStatus[]>,
  start: (id: ServiceId) => ipcRenderer.invoke('service:start', id),
  stop: (id: ServiceId) => ipcRenderer.invoke('service:stop', id),
  restart: (id: ServiceId) => ipcRenderer.invoke('service:restart', id),
  startAll: () => ipcRenderer.invoke('service:startAll'),
  stopAll: () => ipcRenderer.invoke('service:stopAll'),

  // 事件订阅
  onStatus: (cb: (status: ServiceStatus) => void) => {
    const handler = (_e: IpcRendererEvent, status: ServiceStatus) => cb(status);
    ipcRenderer.on('service:status', handler);
    return () => ipcRenderer.removeListener('service:status', handler);
  },
  onLog: (cb: (entry: LogEntry) => void) => {
    const handler = (_e: IpcRendererEvent, entry: LogEntry) => cb(entry);
    ipcRenderer.on('service:log', handler);
    return () => ipcRenderer.removeListener('service:log', handler);
  },

  // conf 配置编辑
  readConf: (relPath: string) =>
    ipcRenderer.invoke('conf:read', relPath) as Promise<
      { file: ConfFile; originalText: string } | { error: string }
    >,
  saveConf: (
    relPath: string,
    originalText: string,
    updates: { key: string; value: string; disabled: boolean }[],
  ) =>
    ipcRenderer.invoke('conf:save', relPath, originalText, updates) as Promise<{
      backup?: string;
      ok: boolean;
      error?: string;
    }>,
  /** 纯文本保存：直接写整段，不经解析 */
  saveConfText: (relPath: string, text: string) =>
    ipcRenderer.invoke('conf:saveText', relPath, text) as Promise<{
      backup?: string;
      ok: boolean;
      error?: string;
    }>,

  // 数据库
  getDbConfig: () => ipcRenderer.invoke('db:getConfig') as Promise<MysqlConfig>,
  testDb: (cfg: MysqlConfig) => ipcRenderer.invoke('db:test', cfg) as Promise<{ ok: boolean; version?: string; error?: string }>,
  initializeDb: (cfg: MysqlConfig) =>
    ipcRenderer.invoke('db:initialize', cfg) as Promise<{
      steps: { ok: boolean; file: string; error?: string }[];
      createError?: string;
    }>,
  listTables: (cfg: MysqlConfig) =>
    ipcRenderer.invoke('db:listTables', cfg) as Promise<
      { ok: true; tables: { name: string; rows: number; sizeMB: number }[] } | { ok: false; error: string }
    >,
  queryTable: (cfg: MysqlConfig, table: string, page: number, pageSize: number, search: string) =>
    ipcRenderer.invoke('db:queryTable', cfg, table, page, pageSize, search) as Promise<
      | { ok: true; data: { columns: string[]; rows: string[][]; total: number } }
      | { ok: false; error: string }
    >,
  listAccounts: (cfg: MysqlConfig, page: number, pageSize: number, search: string) =>
    ipcRenderer.invoke('db:listAccounts', cfg, page, pageSize, search) as Promise<
      | { ok: true; rows: unknown[]; total: number }
      | { ok: false; error: string }
    >,
  createAccount: (cfg: MysqlConfig, userid: string, pass: string, sex: string, email: string) =>
    ipcRenderer.invoke('db:createAccount', cfg, userid, pass, sex, email) as Promise<{ ok: boolean; error?: string }>,
  deleteAccount: (cfg: MysqlConfig, accountId: number) =>
    ipcRenderer.invoke('db:deleteAccount', cfg, accountId) as Promise<{ ok: boolean; error?: string }>,
  setGroup: (cfg: MysqlConfig, accountId: number, groupId: number) =>
    ipcRenderer.invoke('db:setGroup', cfg, accountId, groupId) as Promise<{ ok: boolean; error?: string }>,
  setPassword: (cfg: MysqlConfig, accountId: number, newPass: string) =>
    ipcRenderer.invoke('db:setPassword', cfg, accountId, newPass) as Promise<{ ok: boolean; error?: string }>,
  setBan: (cfg: MysqlConfig, accountId: number, banned: boolean) =>
    ipcRenderer.invoke('db:setBan', cfg, accountId, banned) as Promise<{ ok: boolean; error?: string }>,
  listChars: (cfg: MysqlConfig, accountId: number) =>
    ipcRenderer.invoke('db:listChars', cfg, accountId) as Promise<
      { ok: true; chars: unknown[] } | { ok: false; error: string }
    >,
  setZeny: (cfg: MysqlConfig, charId: number, zeny: number) =>
    ipcRenderer.invoke('db:setZeny', cfg, charId, zeny) as Promise<{ ok: boolean; error?: string }>,
  deleteChar: (cfg: MysqlConfig, charId: number) =>
    ipcRenderer.invoke('db:deleteChar', cfg, charId) as Promise<{ ok: boolean; error?: string }>,
  onlinePlayers: (cfg: MysqlConfig) =>
    ipcRenderer.invoke('db:onlinePlayers', cfg) as Promise<
      { ok: true; players: unknown[] } | { ok: false; error: string }
    >,
  importSql: (cfg: MysqlConfig, relPath: string) =>
    ipcRenderer.invoke('db:importSql', cfg, relPath) as Promise<{ ok: boolean; file: string; error?: string }>,
  backupDb: (cfg: MysqlConfig) =>
    ipcRenderer.invoke('db:backup', cfg) as Promise<{ ok: boolean; error?: string }>,

  // 工具
  listTools: () =>
    ipcRenderer.invoke('tool:list') as Promise<
      { exe: string; name: string; description: string; defaultArgs: string[]; available: boolean }[]
    >,
  runTool: (exe: string, args: string[]) =>
    ipcRenderer.invoke('tool:run', exe, args) as Promise<{
      ok: boolean;
      output: string;
      exitCode: number | null;
      error?: string;
    }>,
};

export type LauncherApi = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('rosever', api);
  } catch (error) {
    console.error(error);
  }
  } else {
    // 非隔离模式（仅开发兼容），挂到 window
    ;(window as unknown as { rosever: typeof api }).rosever = api;
  }
