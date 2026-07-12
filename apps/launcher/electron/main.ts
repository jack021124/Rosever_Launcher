import { app, BrowserWindow, shell, ipcMain, dialog, Menu } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { ProcessManager, ConfStore, DbManager, ToolRunner, TOOLS } from '@rosever/shared';
import type { ServiceId, ConfFile, MysqlConfig, ServiceStatus, LogEntry } from '@rosever/shared';
import { RemoteBridge, type ConnState } from './remoteBridge';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- 配置持久化（serverRoot 等存在用户数据目录） ----

interface LauncherConfig {
  serverRoot: string;
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

function loadConfig(): LauncherConfig {
  try {
    const p = configPath();
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf8')) as LauncherConfig;
    }
  } catch {
    /* 忽略损坏的配置 */
  }
  return { serverRoot: '' };
}

function saveConfig(cfg: LauncherConfig): void {
  try {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch {
    /* 忽略写入错误 */
  }
}

// ---- 进程管理单例 ----

let pm: ProcessManager | null = null;

function serverRoot(): string {
  return loadConfig().serverRoot || process.cwd();
}

function getProcessManager(): ProcessManager {
  if (!pm) {
    pm = new ProcessManager(serverRoot());
    // 事件转发到所有渲染窗口
    pm.onStatus((status) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('service:status', status);
      }
    });
    pm.onLog((entry) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('service:log', entry);
      }
    });
  }
  return pm;
}

/** ConfStore 每次按当前 serverRoot 新建（避免目录切换后用旧路径） */
function getConfStore(): ConfStore {
  return new ConfStore({ serverRoot: serverRoot() });
}

function getDbManager(): DbManager {
  return new DbManager(serverRoot());
}

function getToolRunner(): ToolRunner {
  return new ToolRunner(serverRoot());
}

/** 重置单例（切目录后调用） */
function resetManagers(): void {
  if (pm) {
    pm.dispose();
    pm = null;
  }
}

// ---- 远程模式（target 切换） ----

/** 与渲染层 appStore 的 Target 类型保持结构兼容 */
type Target =
  | { kind: 'local'; name: string }
  | { kind: 'remote'; id: string; name: string; host: string; port: number; token: string };

let currentTarget: Target = { kind: 'local', name: '本地' };
let remoteBridge: RemoteBridge | null = null;
/** 远程连接后从 Agent 拿到的只读信息，缓存给 db:getConfig / config:getServerRoot 用 */
let remoteInfo: { serverRoot: string; dbConfig: MysqlConfig } | null = null;

/** 广播一条消息给所有窗口的渲染进程 */
function broadcastToRender(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

/** 当前是否处于远程模式 */
function isRemote(): boolean {
  return currentTarget.kind === 'remote';
}

/** 是否允许该方法走远程（少数本地 only 的方法除外） */
function remoteDisabled(method: string): boolean {
  // app:version 永远返回本地版本（与 IPC 行为一致）
  return method === 'app:version';
}

/**
 * 高阶 IPC handler：本地走 localFn，远程走 remoteBridge.rpc。
 * localFn 接收去 IpcMainInvokeEvent 之后的参数。
 */
function routed<TFn extends (...args: any[]) => any>(method: string, localFn: TFn) {
  return async (_e: unknown, ...args: unknown[]) => {
    if (isRemote() && remoteBridge && !remoteDisabled(method)) {
      return remoteBridge.rpc(method, args);
    }
    return localFn(...args);
  };
}

/** 建立 / 切换远程连接；切回本地时断开 */
function applyTarget(t: Target): void {
  currentTarget = t;

  // 切走前先断开旧的远程连接
  if (remoteBridge) {
    remoteBridge.dispose();
    remoteBridge = null;
  }
  remoteInfo = null;

  if (t.kind === 'remote') {
    remoteBridge = new RemoteBridge({
      onStatus: (s: ServiceStatus) => broadcastToRender('service:status', s),
      onStatusSnapshot: (all: ServiceStatus[]) => {
        for (const s of all) broadcastToRender('service:status', s);
      },
      onLog: (e: LogEntry) => broadcastToRender('service:log', e),
      onBye: () => broadcastToRender('target:status', { state: 'bye' }),
      onState: (state: ConnState, detail?: string) =>
        broadcastToRender('target:status', { state, detail }),
      onWelcome: (info) => {
        remoteInfo = { serverRoot: info.serverRoot, dbConfig: info.dbConfig };
      },
    });
    remoteBridge.connect(
      { host: t.host, port: t.port, token: t.token },
      app.getVersion(),
    );
  } else {
    // 本地：清空渲染层的服务状态，重新从本地 pm 拉一次
    broadcastToRender('target:status', { state: 'local' });
  }
}

app.on('window-all-closed', () => {
  if (pm) pm.dispose();
  if (remoteBridge) remoteBridge.dispose();
  if (process.platform !== 'darwin') app.quit();
});

// ---- 窗口 ----

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Rosever Launcher',
    backgroundColor: '#1E1E2E',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Windows 上彻底移除菜单栏（autoHideMenuBar 只是按 Alt 才显示，仍会留空间）
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // 去掉 Electron 默认原生菜单栏（文件/编辑/视图/帮助等）—— 对 RO 启动器无意义，
  // 且 DevTools 入口会暴露 IPC 调用，故直接置空 + 隐藏。
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});



// ---- IPC：通用 ----

ipcMain.handle('app:version', () => app.getVersion());

// target 切换：渲染层选了本地/远程时调这个
ipcMain.handle('target:set', (_e, t: Target) => {
  applyTarget(t);
  return { ok: true };
});

// target 测试连接：一次性探测某个远程 target 是否可达 + Token 是否正确
// 不影响当前已连接的 target
ipcMain.handle(
  'target:test',
  async (_e, t: { host: string; port: number; token: string }): Promise<{ ok: boolean; agentVersion?: string; serverRoot?: string; error?: string }> => {
    return new Promise((resolve) => {
      const url = `ws://${t.host}:${t.port}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        resolve({ ok: false, error: `无法创建连接: ${e instanceof Error ? e.message : String(e)}` });
        return;
      }
      const timer = setTimeout(() => {
        try { ws.terminate(); } catch { /* ignore */ }
        resolve({ ok: false, error: '连接超时（8 秒）' });
      }, 8000);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello', token: t.token, clientVersion: app.getVersion() }));
      });
      ws.on('message', (raw) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg?.type === 'welcome') {
          clearTimeout(timer);
          try { ws.close(); } catch { /* ignore */ }
          resolve({
            ok: true,
            agentVersion: msg.agentVersion,
            serverRoot: msg.serverRoot,
          });
        }
        if (msg?.type === 'bye') {
          clearTimeout(timer);
          resolve({ ok: false, error: `被拒绝: ${msg.reason ?? 'Token 错误或 IP 不在白名单'}` });
        }
      });
      ws.on('close', (code) => {
        // 4003 = Token 错误，4001 = IP 不允许
        if (code === 4003) {
          clearTimeout(timer);
          resolve({ ok: false, error: 'Token 错误' });
        } else if (code === 4001) {
          clearTimeout(timer);
          resolve({ ok: false, error: 'IP 不在白名单' });
        }
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ok: false, error: `连接失败: ${err.message}` });
      });
    });
  },
);

// 远程模式下，config:getServerRoot 用 Agent 回传的；pickServerRoot 远程不可用
ipcMain.handle('config:getServerRoot', routed('config:getServerRoot', () => {
  if (isRemote() && remoteInfo) return remoteInfo.serverRoot;
  return loadConfig().serverRoot;
}));

ipcMain.handle('config:pickServerRoot', routed('config:pickServerRoot', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择服务端根目录',
    properties: ['openDirectory'],
    message: '选择 BetterRA / rAthena 服务端根目录（包含 *.exe 与 conf/）',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const root = result.filePaths[0];
  const cfg = loadConfig();
  cfg.serverRoot = root;
  saveConfig(cfg);
  resetManagers();
  return root;
}));

// ---- IPC：进程控制 ----

ipcMain.handle('service:getStatus', routed('service:getStatus', () => getProcessManager().getAllStatus()));

ipcMain.handle('service:start', routed('service:start', (_id: ServiceId) => {
  getProcessManager().start(_id, true);
}));

ipcMain.handle('service:stop', routed('service:stop', (_id: ServiceId) => {
  getProcessManager().stop(_id);
}));

ipcMain.handle('service:restart', routed('service:restart', (_id: ServiceId) => {
  getProcessManager().restart(_id);
}));

ipcMain.handle('service:startAll', routed('service:startAll', () => {
  getProcessManager().startAll();
}));

ipcMain.handle('service:stopAll', routed('service:stopAll', () => {
  getProcessManager().stopAll();
}));

// ---- IPC：conf 配置编辑 ----

/** 读取并解析一个 conf 文件，同时返回原始全文（供保存时还原注释） */
ipcMain.handle('conf:read', routed('conf:read', async (relPath: string): Promise<{ file: ConfFile; originalText: string } | { error: string }> => {
  try {
    const store = getConfStore();
    const file = store.read(relPath);
    const originalText = store.readText(relPath);
    return { file, originalText };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}));

/** 保存 conf 修改（保留注释 + 备份 + 原子写入） */
ipcMain.handle('conf:save', routed('conf:save', async (
  relPath: string,
  originalText: string,
  updates: { key: string; value: string; disabled: boolean }[],
): Promise<{ backup?: string; ok: boolean; error?: string }> => {
  try {
    const backup = getConfStore().save(relPath, originalText, updates);
    return { backup, ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}));

/** 保存 conf 原文（纯文本编辑模式：直接写整段，不经解析） */
ipcMain.handle('conf:saveText', routed('conf:saveText', async (
  relPath: string,
  text: string,
): Promise<{ backup?: string; ok: boolean; error?: string }> => {
  try {
    const backup = getConfStore().saveText(relPath, text);
    return { backup, ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}));

// ---- IPC：数据库 ----

/** 读取 inter_athena.conf 里的 MySQL 配置（远程时用 Agent 回传的缓存） */
ipcMain.handle('db:getConfig', routed('db:getConfig', (): MysqlConfig => {
  if (isRemote() && remoteInfo) {
    // remoteInfo.dbConfig.password 是空的，补上本地 launcher 端不需要密码（Agent 端自己有）
    return remoteInfo.dbConfig;
  }
  try {
    return getDbManager().readConfig();
  } catch {
    return { host: '127.0.0.1', port: 3306, user: 'ragnarok', password: 'ragnarok', database: 'ragnarok' };
  }
}));

/** 测试连接 */
ipcMain.handle('db:test', routed('db:test', async (cfg: MysqlConfig) => getDbManager().testConnection(cfg)));

/** 一键初始化（建库 + 导入核心 sql） */
ipcMain.handle('db:initialize', routed('db:initialize', async (cfg: MysqlConfig) => getDbManager().initialize(cfg)));

/** 数据表列表 */
ipcMain.handle('db:listTables', routed('db:listTables', async (cfg: MysqlConfig) => {
  try {
    return { ok: true as const, tables: await getDbManager().listTables(cfg) };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}));

/** 查询表数据（分页+搜索） */
ipcMain.handle('db:queryTable', routed('db:queryTable', async (cfg: MysqlConfig, table: string, page: number, pageSize: number, search: string) => {
  try {
    return { ok: true as const, data: await getDbManager().queryTable(cfg, table, page, pageSize, search) };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}));

/** 账号列表 */
ipcMain.handle('db:listAccounts', routed('db:listAccounts', async (cfg: MysqlConfig, page: number, pageSize: number, search: string) => {
  try {
    return { ok: true as const, ...(await getDbManager().listAccounts(cfg, page, pageSize, search)) };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}));

/** 注册账号 */
ipcMain.handle('db:createAccount', routed('db:createAccount', async (cfg: MysqlConfig, userid: string, pass: string, sex: string, email: string) =>
  getDbManager().createAccount(cfg, userid, pass, sex as 'M' | 'F', email),
));

/** 删除账号 */
ipcMain.handle('db:deleteAccount', routed('db:deleteAccount', async (cfg: MysqlConfig, accountId: number) =>
  getDbManager().deleteAccount(cfg, accountId),
));

/** 改 GM 等级 */
ipcMain.handle('db:setGroup', routed('db:setGroup', async (cfg: MysqlConfig, accountId: number, groupId: number) =>
  getDbManager().setGroup(cfg, accountId, groupId),
));

/** 重置密码 */
ipcMain.handle('db:setPassword', routed('db:setPassword', async (cfg: MysqlConfig, accountId: number, newPass: string) =>
  getDbManager().setPassword(cfg, accountId, newPass),
));

/** 封禁/解封 */
ipcMain.handle('db:setBan', routed('db:setBan', async (cfg: MysqlConfig, accountId: number, banned: boolean) =>
  getDbManager().setBanState(cfg, accountId, banned),
));

/** 查角色 */
ipcMain.handle('db:listChars', routed('db:listChars', async (cfg: MysqlConfig, accountId: number) => {
  try {
    return { ok: true as const, chars: await getDbManager().listChars(cfg, accountId) };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}));

/** 改 Zeny */
ipcMain.handle('db:setZeny', routed('db:setZeny', async (cfg: MysqlConfig, charId: number, zeny: number) =>
  getDbManager().setZeny(cfg, charId, zeny),
));

/** 删角色 */
ipcMain.handle('db:deleteChar', routed('db:deleteChar', async (cfg: MysqlConfig, charId: number) =>
  getDbManager().deleteChar(cfg, charId),
));

/** 在线玩家 */
ipcMain.handle('db:onlinePlayers', routed('db:onlinePlayers', async (cfg: MysqlConfig) => {
  try {
    return { ok: true as const, players: await getDbManager().onlinePlayers(cfg) };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}));

/** 导入任意 sql 文件（相对服务端根目录） */
ipcMain.handle('db:importSql', routed('db:importSql', async (cfg: MysqlConfig, relPath: string) =>
  getDbManager().importSql(cfg, relPath),
));

/** 整库备份（本地弹保存框；远程时 Agent 备份到自己的 .backup/db/ 下并返回路径） */
ipcMain.handle('db:backup', routed('db:backup', async (cfg: MysqlConfig) => {
  const result = await dialog.showSaveDialog({
    title: '备份数据库',
    defaultPath: `${cfg.database}-${new Date().toISOString().slice(0, 10)}.sql`,
    filters: [{ name: 'SQL', extensions: ['sql'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, error: '已取消' };
  return getDbManager().backupDatabase(cfg, result.filePath);
}));

// ---- IPC：工具 ----

/** 列出可用工具（exe 存在的） */
ipcMain.handle('tool:list', routed('tool:list', () => {
  return TOOLS.map((t) => ({
    exe: t.exe,
    name: t.name,
    description: t.description,
    defaultArgs: t.defaultArgs ?? [],
    available: existsSync(join(serverRoot(), t.exe)),
  }));
}));

/** 运行工具 */
ipcMain.handle('tool:run', routed('tool:run', async (exe: string, args: string[]) => getToolRunner().run(exe, args)));

