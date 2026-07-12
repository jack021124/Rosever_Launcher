import { create } from 'zustand';
import { useServiceStore } from './serviceStore';

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
}

const initialTargets = loadPersistedTargets();

export const useAppStore = create<AppState>((set, get) => ({
  target: initialTargets[0],
  targets: initialTargets,
  connState: 'local',
  connDetail: undefined,

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
