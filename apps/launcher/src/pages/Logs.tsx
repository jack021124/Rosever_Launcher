import { useState, useRef, useEffect, useMemo } from 'react';
import { PageWrapper } from './PageWrapper';
import { SERVICES } from '@rosever/shared/types';
import type { ServiceId, LogLevel } from '@rosever/shared/types';
import { useServiceStore } from '@/store/serviceStore';
import { Icon } from '@/components/Icon';

/** 日志级别颜色（对应黑框里的 [Status]绿/[Error]红 等） */
const LEVEL_COLOR: Record<LogLevel, string> = {
  status: 'text-status-running',
  info: 'text-text-primary',
  notice: 'text-blue-400',
  warning: 'text-status-warning',
  error: 'text-status-crashed',
  debug: 'text-text-muted',
  sql: 'text-purple-400',
  cli: 'text-cyan-400',
};

const SERVICE_FILTERS: { id: ServiceId; label: string }[] = SERVICES.map((s) => ({
  id: s.id as ServiceId,
  label: s.name,
}));

export function Logs() {
  const logs = useServiceStore((s) => s.logs);
  const clearLogs = useServiceStore((s) => s.clearLogs);

  const [filter, setFilter] = useState<ServiceId>('login');
  const [keyword, setKeyword] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return logs.filter((l) => {
      if (l.service !== filter) return false;
      if (kw && !l.text.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [logs, filter, keyword]);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  return (
    <PageWrapper
      title="日志"
      subtitle="实时控制台输出，替代原生黑框"
      actions={
        <button className="btn-ghost" onClick={() => clearLogs(filter)}>
          <Icon.Refresh size={14} />
          清空当前
        </button>
      }
    >
      {/* 工具栏 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1 bg-bg-panel rounded p-0.5 border border-border">
          {SERVICE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                filter === f.id ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Icon.Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="input w-full pl-8"
            placeholder="过滤日志内容…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-accent"
          />
          自动滚动
        </label>
      </div>

      {/* 日志列表 */}
      <div
        ref={containerRef}
        className="card font-mono text-[12px] leading-relaxed h-[calc(100%-100px)] overflow-y-auto p-3 selectable"
      >
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted text-sm">
            <Icon.Log size={32} className="mb-2 opacity-40" />
            {logs.length === 0 ? '暂无日志，启动服务后这里会实时显示控制台输出' : '没有匹配的日志'}
          </div>
        ) : (
          filtered.map((l, i) => (
            <div key={i} className="flex gap-2 px-1 py-0.5 hover:bg-bg-hover/40 rounded">
              <span className="text-text-muted shrink-0 tabular-nums">
                {new Date(l.ts).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
              <span className="text-accent-dim shrink-0 w-14">{l.service}</span>
              <span className={`shrink-0 w-16 font-semibold ${LEVEL_COLOR[l.level]}`}>
                [{l.level}]
              </span>
              <span className={`break-all ${LEVEL_COLOR[l.level]}`}>{l.text}</span>
            </div>
          ))
        )}
      </div>
    </PageWrapper>
  );
}
