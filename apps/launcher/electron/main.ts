import { app, BrowserWindow, shell, ipcMain, dialog, Menu } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { ProcessManager, ConfStore, DbManager, ToolRunner, TOOLS, LOG_TABLES } from '@rosever/shared';
import type { ServiceId, ConfFile, MysqlConfig, ServiceStatus, LogEntry, BackupSchedule } from '@rosever/shared';
import { RemoteBridge, type ConnState } from './remoteBridge';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- 配置持久化（serverRoot 等存在用户数据目录） ----

interface LauncherConfig {
  serverRoot: string;
  backupSchedule: BackupSchedule;
  logBackupSchedule: BackupSchedule;
}

function defaultBackupSchedule(): BackupSchedule {
  return { enabled: false, intervalHours: 24, dir: '', lastBackup: 0 };
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

// config 内存缓存：避免每个 IPC 调用都读磁盘解析 JSON（启动时 ServiceControl
// 连环触发多次 getServerRoot/getDbConfig，不缓存会显著拖慢首屏）
let cachedConfig: LauncherConfig | null = null;

function loadConfig(): LauncherConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const p = configPath();
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<LauncherConfig>;
      cachedConfig = {
        serverRoot: raw.serverRoot ?? '',
        // 兼容旧配置（无 backupSchedule 字段）+ 防御字段缺失
        backupSchedule: { ...defaultBackupSchedule(), ...(raw.backupSchedule ?? {}) },
        logBackupSchedule: { ...defaultBackupSchedule(), ...(raw.logBackupSchedule ?? {}) },
      };
      return cachedConfig;
    }
  } catch {
    /* 忽略损坏的配置 */
  }
  cachedConfig = { serverRoot: '', backupSchedule: defaultBackupSchedule(), logBackupSchedule: defaultBackupSchedule() };
  return cachedConfig;
}

function saveConfig(cfg: LauncherConfig): void {
  try {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
    // 更新缓存
    cachedConfig = cfg;
  } catch {
    /* 忽略写入错误 */
  }
}

// ---- 进程管理单例 ----

let pm: ProcessManager | null = null;
// 缓存 serverRoot，避免每次调用都 loadConfig（切目录时由 resetManagers 清）
let cachedServerRoot: string | null = null;

function serverRoot(): string {
  if (cachedServerRoot !== null) return cachedServerRoot;
  cachedServerRoot = loadConfig().serverRoot || process.cwd();
  return cachedServerRoot;
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

// ---- 数据库自动备份调度器 ----

/**
 * 主进程常驻的定时备份调度器，支持两种独立计划：
 *   - 数据库整库备份（mysqldump 整库）
 *   - 日志表备份（mysqldump 仅 10 张 *log 表，体积大增长快，单独备份更灵活）
 *
 * 每种计划各自有 enabled/intervalHours/dir/lastBackup，互不影响。
 * - 启动时若 lastBackup 距今超过一个周期，立即补备一次（断电恢复）
 * - 全部保留（不自动清理旧文件）
 * - 备份失败静默（lastBackup 不更新，下周期再试）
 */
class BackupScheduler {
  private dbTimer: NodeJS.Timeout | null = null;
  private logTimer: NodeJS.Timeout | null = null;

  /** 启动/重启数据库整库备份 */
  startDb(schedule: BackupSchedule): void {
    if (this.dbTimer) {
      clearInterval(this.dbTimer);
      this.dbTimer = null;
    }
    if (!schedule.enabled || schedule.intervalHours <= 0 || !schedule.dir) return;

    const periodMs = schedule.intervalHours * 3600_000;
    if (schedule.lastBackup > 0 && Date.now() - schedule.lastBackup >= periodMs) {
      this.runDbOnce().catch(() => {});
    }
    this.dbTimer = setInterval(() => {
      this.runDbOnce().catch(() => {});
    }, periodMs);
  }

  /** 启动/重启日志表备份 */
  startLog(schedule: BackupSchedule): void {
    if (this.logTimer) {
      clearInterval(this.logTimer);
      this.logTimer = null;
    }
    if (!schedule.enabled || schedule.intervalHours <= 0 || !schedule.dir) return;

    const periodMs = schedule.intervalHours * 3600_000;
    if (schedule.lastBackup > 0 && Date.now() - schedule.lastBackup >= periodMs) {
      this.runLogOnce().catch(() => {});
    }
    this.logTimer = setInterval(() => {
      this.runLogOnce().catch(() => {});
    }, periodMs);
  }

  stop(): void {
    if (this.dbTimer) {
      clearInterval(this.dbTimer);
      this.dbTimer = null;
    }
    if (this.logTimer) {
      clearInterval(this.logTimer);
      this.logTimer = null;
    }
  }

  /** 立即执行一次整库备份 */
  async runDbOnce(): Promise<{ ok: boolean; error?: string; filePath?: string }> {
    const cfg = loadConfig();
    const sch = cfg.backupSchedule;
    if (!sch.dir) return { ok: false, error: '未设置备份目录' };

    try {
      if (!existsSync(sch.dir)) mkdirSync(sch.dir, { recursive: true });
    } catch (e) {
      return { ok: false, error: `无法创建备份目录: ${e instanceof Error ? e.message : String(e)}` };
    }

    let dbCfg: MysqlConfig;
    try {
      dbCfg = getDbManager().readConfig();
    } catch (e) {
      return { ok: false, error: `读取数据库配置失败: ${e instanceof Error ? e.message : String(e)}` };
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = join(sch.dir, `${dbCfg.database}-${ts}.sql`);

    const res = await getDbManager().backupDatabase(dbCfg, filePath);
    if (res.ok) {
      const next = loadConfig();
      next.backupSchedule.lastBackup = Date.now();
      saveConfig(next);
    }
    return { ...res, filePath };
  }

  /** 立即执行一次日志表备份（仅 10 张 *log 表） */
  async runLogOnce(): Promise<{ ok: boolean; error?: string; filePath?: string }> {
    const cfg = loadConfig();
    const sch = cfg.logBackupSchedule;
    if (!sch.dir) return { ok: false, error: '未设置备份目录' };

    try {
      if (!existsSync(sch.dir)) mkdirSync(sch.dir, { recursive: true });
    } catch (e) {
      return { ok: false, error: `无法创建备份目录: ${e instanceof Error ? e.message : String(e)}` };
    }

    let dbCfg: MysqlConfig;
    try {
      dbCfg = getDbManager().readConfig();
    } catch (e) {
      return { ok: false, error: `读取数据库配置失败: ${e instanceof Error ? e.message : String(e)}` };
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = join(sch.dir, `${dbCfg.database}-logs-${ts}.sql`);

    const res = await getDbManager().backupLogTables(dbCfg, filePath, [...LOG_TABLES]);
    if (res.ok) {
      const next = loadConfig();
      next.logBackupSchedule.lastBackup = Date.now();
      saveConfig(next);
    }
    return { ...res, filePath };
  }
}

const backupScheduler = new BackupScheduler();

/** 重置单例（切目录后调用） */
function resetManagers(): void {
  if (pm) {
    pm.dispose();
    pm = null;
  }
  // 清缓存：下次 serverRoot()/loadConfig() 重新读
  cachedServerRoot = null;
  cachedConfig = null;
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
    title: '渡鸦',
    backgroundColor: '#1E1E2E',
    // 无边框窗口（ZCode 风格）：去掉原生标题栏，窗口控制按钮由自定义 TitleBar 提供
    frame: false,
    // macOS 保留红绿灯按钮（hiddenInset 隐藏标题文字但保留按钮）
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Windows 上彻底移除菜单栏
  mainWindow.setMenuBarVisibility(false);

  // 窗口显示：ready-to-show 时立刻显示；超过 1.5 秒兜底强制显示
  // （portable 自解压 + 首次加载可能较慢，避免长时间无响应）
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });
  setTimeout(() => {
    if (!mainWindow.isDestroyed()) mainWindow.show();
  }, 1500);

  // 最大化状态变化时通知渲染层（自定义标题栏的按钮图标要更新）
  mainWindow.on('maximize', () => mainWindow.webContents.send('win:maximizeChanged', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximizeChanged', false));

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
  // 启动数据库自动备份调度器（若已启用）
  const initCfg = loadConfig();
  backupScheduler.startDb(initCfg.backupSchedule);
  backupScheduler.startLog(initCfg.logBackupSchedule);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 退出前停止调度器，避免残留定时器
app.on('before-quit', () => {
  backupScheduler.stop();
});



// ---- IPC：通用 ----

ipcMain.handle('app:version', () => app.getVersion());

// 窗口控制（无边框窗口的自定义标题栏用）
ipcMain.handle('win:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});
ipcMain.handle('win:maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.handle('win:close', () => {
  BrowserWindow.getFocusedWindow()?.close();
});
ipcMain.handle('win:isMaximized', () => {
  return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false;
});

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

/** 递归列出某目录下所有 .conf 文件（相对服务端根目录，正斜杠） */
ipcMain.handle('conf:listTree', routed('conf:listTree', async (dirRel: string): Promise<{ files: string[] } | { error: string }> => {
  try {
    return { files: getConfStore().listConfTree(dirRel) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}));

/** 新建 conf 文件（已存在则返回错误，不覆盖） */
ipcMain.handle('conf:create', routed('conf:create', async (relPath: string): Promise<{ ok: boolean; path?: string; error?: string }> => {
  try {
    const path = getConfStore().createConf(relPath);
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}));

/** 安全覆盖模式：读取合并后的生效值（原文件 + import 覆盖） */
ipcMain.handle('conf:readMerged', routed('conf:readMerged', async (relPath: string): Promise<{ mergedText: string; originalText: string } | { error: string }> => {
  try {
    return getConfStore().readMerged(relPath);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}));

/** 安全覆盖模式：只把 diff 写入 import 覆盖文件，原文件不动 */
ipcMain.handle('conf:saveImport', routed('conf:saveImport', async (relPath: string, editedText: string): Promise<{ ok: boolean; backup?: string; error?: string }> => {
  try {
    const backup = getConfStore().saveImport(relPath, editedText);
    return { ok: true, backup };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}));

/** 读取各 athena conf 的服务端口（login/char/map/web/websocket） */
ipcMain.handle('conf:servicePorts', routed('conf:servicePorts', async (): Promise<Record<string, number | null>> => {
  try {
    return getConfStore().readServicePorts();
  } catch {
    return {};
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

// ---- IPC：数据库自动备份计划（整库 + 日志表两套） ----

/** 读取整库备份计划 */
ipcMain.handle('backup:getSchedule', (): BackupSchedule => {
  return loadConfig().backupSchedule;
});

/** 读取日志表备份计划 */
ipcMain.handle('backup:getLogSchedule', (): BackupSchedule => {
  return loadConfig().logBackupSchedule;
});

/** 保存整库备份计划并重启该调度器 */
ipcMain.handle('backup:setSchedule', (_e, schedule: BackupSchedule): { ok: boolean } => {
  const cfg = loadConfig();
  cfg.backupSchedule = { ...schedule, lastBackup: cfg.backupSchedule.lastBackup };
  saveConfig(cfg);
  backupScheduler.startDb(cfg.backupSchedule);
  return { ok: true };
});

/** 保存日志表备份计划并重启该调度器 */
ipcMain.handle('backup:setLogSchedule', (_e, schedule: BackupSchedule): { ok: boolean } => {
  const cfg = loadConfig();
  cfg.logBackupSchedule = { ...schedule, lastBackup: cfg.logBackupSchedule.lastBackup };
  saveConfig(cfg);
  backupScheduler.startLog(cfg.logBackupSchedule);
  return { ok: true };
});

/** 选择备份目录（弹文件夹选择框，整库/日志共用） */
ipcMain.handle('backup:pickDir', async (): Promise<{ dir?: string; canceled: boolean }> => {
  const result = await dialog.showOpenDialog({
    title: '选择备份目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  return { dir: result.filePaths[0], canceled: false };
});

/** 立即执行一次整库备份 */
ipcMain.handle('backup:runNow', async (): Promise<{ ok: boolean; error?: string; filePath?: string }> => {
  return backupScheduler.runDbOnce();
});

/** 立即执行一次日志表备份 */
ipcMain.handle('backup:runLogNow', async (): Promise<{ ok: boolean; error?: string; filePath?: string }> => {
  return backupScheduler.runLogOnce();
});

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

