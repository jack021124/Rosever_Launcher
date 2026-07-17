import { create } from 'zustand';
import type { MysqlConfig } from '@rosever/shared/types';

/**
 * 数据库连接状态（跨页面持久）。
 *
 * Database 组件每次挂载时 connected 会重置为 false，切走再切回就要重新点
 * 「测试连接」。把 connected 放到全局 store，组件卸载不丢失。
 *
 * 记录 dbConfig：测试连接成功时保存当时的 cfg，后续切回页面时若 cfg 没变，
 * 直接沿用 connected=true。若用户改了 cfg，下次进页面会重新检测。
 */
interface DbState {
  /** 是否已连接（上次测试成功的状态） */
  connected: boolean;
  /** 上次测试连接成功时使用的配置（用于判断 cfg 是否变化） */
  lastCfg: MysqlConfig | null;
  /** 标记连接成功（记录当时 cfg） */
  markConnected: (cfg: MysqlConfig) => void;
  /** 标记断开 */
  markDisconnected: () => void;
  /** 判断当前 cfg 是否和上次成功时一致 */
  cfgUnchanged: (cfg: MysqlConfig) => boolean;
}

/** 浅比较 MysqlConfig（5 个字段都是基本类型） */
function cfgEqual(a: MysqlConfig, b: MysqlConfig): boolean {
  return a.host === b.host && a.port === b.port && a.user === b.user && a.password === b.password && a.database === b.database;
}

export const useDbStore = create<DbState>((set, get) => ({
  connected: false,
  lastCfg: null,
  markConnected: (cfg) => set({ connected: true, lastCfg: cfg }),
  markDisconnected: () => set({ connected: false }),
  cfgUnchanged: (cfg) => {
    const last = get().lastCfg;
    return last ? cfgEqual(last, cfg) : false;
  },
}));
