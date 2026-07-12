import { create } from 'zustand';
import type { ServiceId, ServiceStatus, LogEntry } from '@rosever/shared/types';
import { SERVICES } from '@rosever/shared/types';

interface ServiceState {
  statuses: Record<ServiceId, ServiceStatus>;
  logs: LogEntry[];
  /** 更新单个服务状态 */
  updateStatus: (status: ServiceStatus) => void;
  /** 追加日志（保留最近 1000 条） */
  appendLog: (entry: LogEntry) => void;
  clearLogs: (service?: ServiceId) => void;
}

/** 初始状态：全部 stopped */
const initialStatuses = () => {
  const map = {} as Record<ServiceId, ServiceStatus>;
  for (const s of SERVICES) {
    map[s.id] = { id: s.id, state: 'stopped', restartCount: 0 };
  }
  return map;
};

export const useServiceStore = create<ServiceState>((set) => ({
  statuses: initialStatuses(),
  logs: [],
  updateStatus: (status) =>
    set((state) => ({ statuses: { ...state.statuses, [status.id]: status } })),
  appendLog: (entry) =>
    set((state) => {
      const logs = [...state.logs, entry];
      // 保留最近 1000 条
      if (logs.length > 1000) logs.splice(0, logs.length - 1000);
      return { logs };
    }),
  clearLogs: (service) =>
    set((state) => ({
      logs: service ? state.logs.filter((l) => l.service !== service) : [],
    })),
}));
