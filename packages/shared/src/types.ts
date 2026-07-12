/**
 * Rosever 共享类型定义
 * launcher 与 agent 共用
 */

/** BetterRA 的 5 个核心服务 */
export type ServiceId =
  | 'login'
  | 'char'
  | 'map'
  | 'web'
  | 'websocket';

/** 服务元数据：可执行文件、端口、说明 */
export interface ServiceMeta {
  id: ServiceId;
  /** 可执行文件名，相对服务端根目录 */
  exe: string;
  /** 启动脚本名（兼容旧 bat 流程） */
  bat: string;
  name: string;
  /** 监听端口（用于健康检查） */
  port: number;
  /** 简短说明 */
  description: string;
}

/** 全部服务定义 */
export const SERVICES: readonly ServiceMeta[] = [
  { id: 'login', exe: 'login-server.exe', bat: 'logserv.bat', name: '登录服务器', port: 6900, description: '处理账号登录认证' },
  { id: 'char', exe: 'char-server.exe', bat: 'charserv.bat', name: '角色服务器', port: 6121, description: '管理角色数据' },
  { id: 'map', exe: 'map-server.exe', bat: 'mapserv.bat', name: '地图服务器', port: 5121, description: '游戏主逻辑、地图、移动、战斗' },
  { id: 'web', exe: 'web-server.exe', bat: 'webserv.bat', name: 'Web 服务器', port: 8888, description: 'Web API / 商城接口' },
  { id: 'websocket', exe: 'websocket-server.exe', bat: '', name: 'WebSocket 服务器', port: 5000, description: '网页客户端实时通讯' },
] as const;

/** 进程运行状态 */
export type RunState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';

/** 单个服务的实时状态 */
export interface ServiceStatus {
  id: ServiceId;
  state: RunState;
  pid?: number;
  /** 进程启动时间 (ms 时间戳) */
  startedAt?: number;
  /** CPU 占比 (%) */
  cpu?: number;
  /** 内存 (MB) */
  memoryMB?: number;
  /** 累计重启次数 */
  restartCount: number;
  /** 最近一次退出码 */
  lastExitCode?: number;
  /** 最近错误信息 */
  lastError?: string;
}

/** 日志级别（对应黑框里的颜色标记） */
export type LogLevel = 'status' | 'info' | 'notice' | 'warning' | 'error' | 'debug' | 'sql' | 'cli';

/** 一条日志 */
export interface LogEntry {
  /** 来自哪个服务 */
  service: ServiceId;
  level: LogLevel;
  text: string;
  /** ms 时间戳 */
  ts: number;
}

/** 配置值类型 —— 决定 battle 编辑器渲染哪种控件 */
export type ConfValueType =
  | 'boolean' // yes/no/on/off
  | 'percent' // 百分比：注释含「百分比选项」
  | 'enum' // 枚举：注释含 0= 1= 2=
  | 'mask' // 掩码：注释含「掩码选项」
  | 'number' // 纯数字
  | 'string' // 其余
  | 'header'; // 章节标题（//==== 包围的标题行），不可编辑

/** 掩码选项的位含义（来自 feature.conf 注释） */
export interface MaskBit {
  bit: number;
  label: string;
}

/** 枚举选项 */
export interface EnumOption {
  value: number | string;
  label: string;
}

/** 解析后的单个配置项 */
export interface ConfItem {
  /** 配置键，如 base_exp_rate */
  key: string;
  /** 当前值（字符串形式，原样） */
  value: string;
  /** 值类型（控制 UI 控件） */
  type: ConfValueType;
  /** 上方注释聚合而成的帮助文字 */
  help?: string;
  /** 简短标签（取注释首行） */
  label?: string;
  /** 枚举可选值 */
  options?: EnumOption[];
  /** 掩码位定义 */
  maskBits?: MaskBit[];
  /** 该项在原文件里是否被注释禁用（行首 //） */
  disabled: boolean;
  /** 原始行号 */
  line: number;
  /** 是否相对默认值被修改过 */
  dirty: boolean;
}

/** 解析后的整个 conf 文件 */
export interface ConfFile {
  /** 相对服务端根目录的路径，如 conf/battle/exp.conf */
  path: string;
  /** 按出现顺序的配置项 */
  items: ConfItem[];
  /** 文件总行数 */
  lineCount: number;
}

/** battle/ 下的 20 个配置分类 */
export const BATTLE_CONF_FILES: readonly { file: string; label: string; desc: string }[] = [
  { file: 'battle.conf', label: '基础战斗', desc: 'HP/SP/属性基础参数' },
  { file: 'exp.conf', label: '经验', desc: '经验倍率、死亡惩罚、升级机制' },
  { file: 'drops.conf', label: '掉落', desc: '掉落倍率、拾取优先级' },
  { file: 'player.conf', label: '玩家', desc: '玩家属性上限、出生点、坐骑' },
  { file: 'monster.conf', label: '魔物', desc: '魔物属性、攻击行为、AI' },
  { file: 'skill.conf', label: '技能', desc: '技能冷却、伤害计算、施法' },
  { file: 'items.conf', label: '物品', desc: '物品卡片、装备效果' },
  { file: 'feature.conf', label: '功能开关', desc: '拍卖/银行/挂店/传送' },
  { file: 'pet.conf', label: '宠物', desc: '宠物捕获、忠诚、进化' },
  { file: 'homunc.conf', label: '人工生命体', desc: '生命体相关' },
  { file: 'guild.conf', label: '公会', desc: '公会与城战' },
  { file: 'party.conf', label: '组队', desc: '组队经验分配' },
  { file: 'status.conf', label: '状态', desc: '状态持续、抗性' },
  { file: 'gm.conf', label: 'GM', desc: 'GM 等级、指令权限' },
  { file: 'misc.conf', label: '其他', desc: '决斗、昼夜、禁言、日志' },
  { file: 'battleground.conf', label: '战场', desc: '战场机制' },
  { file: 'instance.conf', label: '副本', desc: '副本相关' },
  { file: 'client.conf', label: '客户端', desc: '客户端特殊配置' },
  { file: 'BetterRa.conf', label: 'BetterRA 拓展', desc: 'BetterRA 特性配置' },
] as const;

/** 配置页的一级分类（左侧导航），每类对应若干 conf 文件 */
export interface ConfSection {
  /** 分类标识 */
  id: string;
  /** 分类显示名 */
  label: string;
  /** 该分类包含的文件（相对 conf/ 的路径） */
  files: { path: string; label: string }[];
}

export const CONF_SECTIONS: readonly ConfSection[] = [
  {
    id: 'basic',
    label: '基本设置',
    files: [
      { path: 'char_athena.conf', label: '服务器信息' },
      { path: 'login_athena.conf', label: '登录服务器' },
      { path: 'inter_athena.conf', label: '内部通讯 / 数据库' },
      { path: 'map_athena.conf', label: '地图服务器' },
    ],
  },
  {
    id: 'battle',
    label: '战斗参数',
    files: BATTLE_CONF_FILES.map((b) => ({ path: `battle/${b.file}`, label: b.label })),
  },
  {
    id: 'maps',
    label: '地图列表',
    files: [
      { path: 'maps_athena.conf', label: '地图清单' },
    ],
  },
  {
    id: 'gm',
    label: 'GM 权限',
    files: [
      { path: 'gm.conf', label: 'GM 设置' },
      { path: 'groups.yml', label: '玩家组 (yml)' },
    ],
  },
] as const;

/** MySQL 连接配置（纯类型，供渲染层与主进程共用） */
export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}
