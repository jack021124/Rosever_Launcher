import { useEffect } from 'react';
import { useServiceStore } from '@/store/serviceStore';

/**
 * 订阅主进程的服务状态 & 日志事件，桥接到 zustand。
 * 在 App 顶层挂一次即可全局生效。
 */
export function useServiceEvents(): void {
  const updateStatus = useServiceStore((s) => s.updateStatus);
  const appendLog = useServiceStore((s) => s.appendLog);

  useEffect(() => {
    // 初始拉一次状态快照
    window.rosever.getStatus().then((snapshot) => {
      if (snapshot) snapshot.forEach(updateStatus);
    });

    const offStatus = window.rosever.onStatus(updateStatus);
    const offLog = window.rosever.onLog(appendLog);

    return () => {
      offStatus?.();
      offLog?.();
    };
  }, [updateStatus, appendLog]);
}
