/**
 * Agent 端 RPC 方法分发器
 *
 * 把 launcher 的 28 个 IPC channel 全部实现为 (args) => Promise<result> 形式。
 * 路由极薄：method 字段直接对应 key。
 *
 * 远程模式语义：
 *   - db:* 忽略 launcher 传入的 cfg，由 Agent 自己从 inter_athena.conf 读
 *   - config:pickServerRoot 远程不支持
 *   - db:backup 备份到 serverRoot/.backup/db/ 下，返回路径
 *   - service:* 成功/失败通过 status 推送观察，这里返回 void（与本地一致）
 */
import path from 'node:path';
import fs from 'node:fs';
import {
  ProcessManager,
  ConfStore,
  DbManager,
  ToolRunner,
  TOOLS,
} from '@rosever/shared';
import type { MysqlConfig, ServiceId } from '@rosever/shared';

export type RpcHandler = (args: unknown[]) => Promise<unknown> | unknown;

export interface DispatcherDeps {
  pm: ProcessManager;
  serverRoot: string;
}

/**
 * 构建方法分发器。
 *
 * ProcessManager 单例传入（外部保证只有一个）；
 * ConfStore / DbManager / ToolRunner 每次调用按需 new（与 launcher main 行为一致）。
 */
export function buildDispatcher({ pm, serverRoot }: DispatcherDeps): Map<string, RpcHandler> {
  const m = new Map<string, RpcHandler>();

  // ---------- app / config ----------
  m.set('app:version', () => AGENT_VERSION);
  m.set('config:getServerRoot', () => serverRoot);
  m.set('config:pickServerRoot', async () => {
    throw new Error('远程模式下不支持更换服务端目录（请在 Agent 端 agent.json 配置）');
  });

  // ---------- service ----------
  m.set('service:getStatus', () => pm.getAllStatus());
  m.set('service:start', (args) => {
    pm.start(args[0] as ServiceId, true);
  });
  m.set('service:stop', (args) => {
    pm.stop(args[0] as ServiceId);
  });
  m.set('service:restart', (args) => {
    pm.restart(args[0] as ServiceId);
  });
  m.set('service:startAll', () => {
    pm.startAll();
  });
  m.set('service:stopAll', () => {
    pm.stopAll();
  });

  // ---------- conf ----------
  m.set('conf:read', (args) => {
    const relPath = args[0] as string;
    const store = new ConfStore({ serverRoot });
    try {
      const file = store.read(relPath);
      const originalText = store.readText(relPath);
      return { file, originalText };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
  m.set('conf:save', (args) => {
    const [relPath, originalText, updates] = args as [
      string,
      string,
      { key: string; value: string; disabled: boolean }[],
    ];
    const store = new ConfStore({ serverRoot });
    try {
      const backup = store.save(relPath, originalText, updates);
      return { backup, ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  m.set('conf:saveText', (args) => {
    const [relPath, text] = args as [string, string];
    const store = new ConfStore({ serverRoot });
    try {
      const backup = store.saveText(relPath, text);
      return { backup, ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ---------- db ----------
  // 注意：所有 db 方法忽略 launcher 传入的 cfg，由 Agent 自己读
  const readDbCfg = (): MysqlConfig => new DbManager(serverRoot).readConfig();
  const safeDbCfg = (): MysqlConfig => {
    try {
      return new DbManager(serverRoot).readConfig();
    } catch {
      return { host: '127.0.0.1', port: 3306, user: 'ragnarok', password: 'ragnarok', database: 'ragnarok' };
    }
  };

  m.set('db:getConfig', () => safeDbCfg());
  m.set('db:test', async () => new DbManager(serverRoot).testConnection(readDbCfg()));
  m.set('db:initialize', async () => new DbManager(serverRoot).initialize(readDbCfg()));

  m.set('db:listTables', async () => {
    try {
      return { ok: true, tables: await new DbManager(serverRoot).listTables(readDbCfg()) };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  m.set('db:queryTable', async (args) => {
    const [, table, page, pageSize, search] = args as [unknown, string, number, number, string];
    try {
      return { ok: true, data: await new DbManager(serverRoot).queryTable(readDbCfg(), table, page, pageSize, search) };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  m.set('db:listAccounts', async (args) => {
    const [, page, pageSize, search] = args as [unknown, number, number, string];
    try {
      return { ok: true, ...(await new DbManager(serverRoot).listAccounts(readDbCfg(), page, pageSize, search)) };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  m.set('db:createAccount', async (args) => {
    const [, userid, pass, sex, email] = args as [unknown, string, string, string, string];
    return new DbManager(serverRoot).createAccount(readDbCfg(), userid, pass, sex as 'M' | 'F', email);
  });
  m.set('db:deleteAccount', async (args) => {
    const [, accountId] = args as [unknown, number];
    return new DbManager(serverRoot).deleteAccount(readDbCfg(), accountId);
  });
  m.set('db:setGroup', async (args) => {
    const [, accountId, groupId] = args as [unknown, number, number];
    return new DbManager(serverRoot).setGroup(readDbCfg(), accountId, groupId);
  });
  m.set('db:setPassword', async (args) => {
    const [, accountId, newPass] = args as [unknown, number, string];
    return new DbManager(serverRoot).setPassword(readDbCfg(), accountId, newPass);
  });
  m.set('db:setBan', async (args) => {
    const [, accountId, banned] = args as [unknown, number, boolean];
    return new DbManager(serverRoot).setBanState(readDbCfg(), accountId, banned);
  });
  m.set('db:listChars', async (args) => {
    const [, accountId] = args as [unknown, number];
    try {
      return { ok: true, chars: await new DbManager(serverRoot).listChars(readDbCfg(), accountId) };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  m.set('db:setZeny', async (args) => {
    const [, charId, zeny] = args as [unknown, number, number];
    return new DbManager(serverRoot).setZeny(readDbCfg(), charId, zeny);
  });
  m.set('db:deleteChar', async (args) => {
    const [, charId] = args as [unknown, number];
    return new DbManager(serverRoot).deleteChar(readDbCfg(), charId);
  });
  m.set('db:onlinePlayers', async () => {
    try {
      return { ok: true, players: await new DbManager(serverRoot).onlinePlayers(readDbCfg()) };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  m.set('db:importSql', async (args) => {
    const [, relPath] = args as [unknown, string];
    return new DbManager(serverRoot).importSql(readDbCfg(), relPath);
  });
  m.set('db:backup', async () => {
    // 远程模式：备份到 serverRoot/.backup/db/<database>-<timestamp>.sql，返回路径
    const cfg = readDbCfg();
    const dir = path.join(serverRoot, '.backup', 'db');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(dir, `${cfg.database}-${ts}.sql`);
    return new DbManager(serverRoot).backupDatabase(cfg, outPath);
  });

  // ---------- tool ----------
  m.set('tool:list', () => {
    return TOOLS.map((t) => ({
      exe: t.exe,
      name: t.name,
      description: t.description,
      defaultArgs: t.defaultArgs ?? [],
      available: fs.existsSync(path.join(serverRoot, t.exe)),
    }));
  });
  m.set('tool:run', async (args) => {
    const [exe, runArgs] = args as [string, string[]];
    return new ToolRunner(serverRoot).run(exe, runArgs);
  });

  return m;
}

/** Agent 版本号（与 main.ts 保持一致，独立于 launcher） */
export const AGENT_VERSION = '0.1.0';
