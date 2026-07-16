import { create } from 'zustand';
import { useServiceStore } from './serviceStore';
import {
  getTheme,
  DEFAULT_THEME,
  CODE_HIGHLIGHT_DARK,
  CODE_HIGHLIGHT_LIGHT,
  type CustomSettings,
  defaultCustomSettings,
  DEFAULT_FONT_SANS,
  DEFAULT_FONT_MONO,
  DEFAULT_FONT_SIZE_BASE,
  DEFAULT_CE_FONT_SIZE,
  DEFAULT_CE_LINE_HEIGHT,
} from '@/themes';

/** 当前操作目标：本地或某台远程服务器 */
export type Target =
  | { kind: 'local'; name: string }
  | { kind: 'remote'; id: string; name: string; host: string; port: number; token: string };

/** 远程连接状态（与 preload 的 TargetStatus 对齐） */
export type ConnState =
  | 'local'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'disconnected'
  | 'rejected'
  | 'bye';

const TARGETS_STORAGE_KEY = 'rosever.targets';
const THEME_STORAGE_KEY = 'rosever.theme';
const CUSTOM_STORAGE_KEY = 'rosever.custom';

export type Theme = string; // 主题 id（见 themes.ts 的 THEMES）

/**
 * 把主题 + 自定义叠加应用到 DOM。
 * 顺序：先写主题的 colors + 对应 mode 的高亮，再写字体默认值，最后叠加用户自定义覆盖。
 * 自定义字段为 null 时跳过（用主题/默认值），非 null 则覆盖。
 */
function applyTheme(themeId: string, custom?: CustomSettings): void {
  const theme = getTheme(themeId);
  const root = document.documentElement;
  root.dataset.theme = theme.mode;
  root.dataset.themeId = themeId;

  // 1. 主题颜色 + 对应 mode 的高亮配色
  const all: Record<string, string> = {
    ...theme.colors,
    ...(theme.mode === 'dark' ? CODE_HIGHLIGHT_DARK : CODE_HIGHLIGHT_LIGHT),
  };

  // 2. 字体默认值（主题不写这些，由这里提供兜底）。字号必须带 px 单位
  all['--font-sans'] = DEFAULT_FONT_SANS;
  all['--font-mono'] = DEFAULT_FONT_MONO;
  all['--font-size-base'] = `${DEFAULT_FONT_SIZE_BASE}px`;
  all['--ce-font-size'] = `${DEFAULT_CE_FONT_SIZE}px`;
  all['--ce-line-height'] = String(DEFAULT_CE_LINE_HEIGHT);

  // 3. 叠加用户自定义（非空才覆盖）
  if (custom) {
    if (custom.fontSans) all['--font-sans'] = custom.fontSans;
    if (custom.fontMono) all['--font-mono'] = custom.fontMono;
    if (custom.fontSizeBase != null) all['--font-size-base'] = `${custom.fontSizeBase}px`;
    if (custom.ceFontSize != null) all['--ce-font-size'] = `${custom.ceFontSize}px`;
    if (custom.ceLineHeight != null) all['--ce-line-height'] = String(custom.ceLineHeight);
    Object.assign(all, custom.highlight);
  }

  for (const [k, v] of Object.entries(all)) {
    root.style.setProperty(k, v);
  }
}

/** 从 localStorage 加载主题 id */
function loadPersistedTheme(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** 从 localStorage 加载字体/高亮自定义 */
function loadPersistedCustom(): CustomSettings {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (raw) return { ...defaultCustomSettings(), ...JSON.parse(raw) };
  } catch {
    /* localStorage 不可用 */
  }
  return defaultCustomSettings();
}

/** 持久化字体/高亮自定义 */
function persistCustom(c: CustomSettings): void {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* localStorage 不可用 */
  }
}

/** 从 localStorage 加载已保存的 target 列表 */
function loadPersistedTargets(): Target[] {
  try {
    const raw = localStorage.getItem(TARGETS_STORAGE_KEY);
    if (!raw) return [{ kind: 'local', name: '本地' }];
    const arr = JSON.parse(raw) as Target[];
    // 永远保证本地项在最前
    const local = arr.find((t) => t.kind === 'local') ?? { kind: 'local', name: '本地' };
    const remotes = arr.filter((t) => t.kind === 'remote');
    return [local, ...remotes];
  } catch {
    return [{ kind: 'local', name: '本地' }];
  }
}

/** 保存 target 列表到 localStorage */
function persistTargets(targets: Target[]): void {
  try {
    localStorage.setItem(TARGETS_STORAGE_KEY, JSON.stringify(targets));
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

/** 生成远程 target 的唯一 id */
function genId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

interface AppState {
  /** 当前选中目标 */
  target: Target;
  /** 配置过的目标列表 */
  targets: Target[];
  /** 当前远程连接状态（local 模式时为 'local'） */
  connState: ConnState;
  /** 连接状态附加说明（如重连倒计时） */
  connDetail?: string;
  /** 切换目标（会通知主进程） */
  switchTarget: (t: Target) => Promise<void>;
  /** 添加一个远程 target */
  addTarget: (t: Omit<Extract<Target, { kind: 'remote' }>, 'kind' | 'id'>) => void;
  /** 删除一个远程 target */
  removeTarget: (id: string) => void;
  /** 更新连接状态（由 onTargetStatus 推送触发） */
  setConnState: (s: ConnState, detail?: string) => void;
  /** 服务端根目录（本地，从主进程配置加载） */
  serverRoot: string;
  /** 服务端目录是否已配置 */
  serverRootReady: boolean;
  /** 从主进程加载 serverRoot */
  loadServerRoot: () => Promise<void>;
  /** 让用户选择目录并保存 */
  pickServerRoot: () => Promise<void>;
  /** 当前主题 id */
  theme: Theme;
  /** 切换到指定主题（写 CSS 变量 + 持久化，带上当前自定义） */
  setTheme: (id: string) => void;
  /** 字体/高亮自定义设置 */
  custom: CustomSettings;
  /** 更新自定义设置（局部合并，立即应用到 DOM + 持久化） */
  setCustom: (patch: Partial<CustomSettings>) => void;
  /** 重置全部自定义为主题默认 */
  resetCustom: () => void;
}

const initialTargets = loadPersistedTargets();
const initialTheme = loadPersistedTheme();
const initialCustom = loadPersistedCustom();
// 启动时立即应用主题 + 自定义，避免首屏闪烁
applyTheme(initialTheme, initialCustom);

export const useAppStore = create<AppState>((set, get) => ({
  target: initialTargets[0],
  targets: initialTargets,
  connState: 'local',
  connDetail: undefined,
  theme: initialTheme,
  custom: initialCustom,

  switchTarget: async (t) => {
    // 切换前清空服务状态/日志，避免上一个 target 的数据残留
    const svc = useServiceStore.getState();
    for (const id of Object.keys(svc.statuses) as (keyof typeof svc.statuses)[]) {
      svc.updateStatus({
        ...svc.statuses[id],
        state: 'stopped',
        pid: undefined,
        startedAt: undefined,
      });
    }
    svc.clearLogs();

    set({ target: t, connState: t.kind === 'local' ? 'local' : 'connecting', connDetail: undefined });
    // 通知主进程建立/断开远程连接
    await window.rosever.setTarget(t);

    // 本地模式下立即拉一次状态
    if (t.kind === 'local') {
      try {
        const snap = await window.rosever.getStatus();
        if (snap) {
          snap.forEach(useServiceStore.getState().updateStatus);
        }
      } catch {
        /* 忽略 */
      }
    }
  },

  addTarget: (info) => {
    const remote: Target = { kind: 'remote', id: genId(), ...info };
    const targets = [...get().targets, remote];
    persistTargets(targets);
    set({ targets });
  },

  removeTarget: (id) => {
    const targets = get().targets.filter((t) => !(t.kind === 'remote' && t.id === id));
    persistTargets(targets);
    // 如果删的正好是当前选中的，切回本地
    const cur = get().target;
    if (cur.kind === 'remote' && cur.id === id) {
      void get().switchTarget(targets[0]);
    } else {
      set({ targets });
    }
  },

  setConnState: (s, detail) => set({ connState: s, connDetail: detail }),

  serverRoot: '',
  serverRootReady: false,
  loadServerRoot: async () => {
    const root = await window.rosever.getServerRoot();
    set({ serverRoot: root ?? '', serverRootReady: !!root });
  },
  pickServerRoot: async () => {
    const root = await window.rosever.pickServerRoot();
    if (root) {
      set({ serverRoot: root, serverRootReady: true });
      // 切换目录后刷新一次状态快照
      const snap = await window.rosever.getStatus();
      if (snap) {
        const { updateStatus } = useServiceStore.getState();
        snap.forEach(updateStatus);
      }
    }
  },

  setTheme: (id: string) => {
    applyTheme(id, get().custom);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* localStorage 不可用 */
    }
    set({ theme: id });
  },

  setCustom: (patch) => {
    const next = { ...get().custom, ...patch };
    applyTheme(get().theme, next);
    persistCustom(next);
    set({ custom: next });
  },

  resetCustom: () => {
    const next = defaultCustomSettings();
    applyTheme(get().theme, next);
    persistCustom(next);
    set({ custom: next });
  },
}));

/**
 * 把 preload 推送的 TargetStatus 映射到 store 的 ConnState
 */
export function mapTargetStatus(state: string): ConnState {
  switch (state) {
    case 'local':
    case 'connecting':
    case 'authenticating':
    case 'connected':
    case 'disconnected':
    case 'rejected':
    case 'bye':
      return state;
    default:
      return 'disconnected';
  }
}
