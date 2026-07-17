import { useState, useEffect, useCallback } from 'react';
import { PageWrapper } from './PageWrapper';
import { SERVICES } from '@rosever/shared/types';
import type { ServiceId, RunState } from '@rosever/shared/types';
import { useServiceStore } from '@/store/serviceStore';
import { useAppStore } from '@/store/appStore';
import { Icon } from '@/components/Icon';

const STATE_LABEL: Record<RunState, string> = {
  stopped: '已停止',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  crashed: '已崩溃',
};
const STATE_DOT: Record<RunState, string> = {
  stopped: 'bg-status-stopped',
  starting: 'bg-status-warning animate-pulse',
  running: 'bg-status-running',
  stopping: 'bg-status-warning animate-pulse',
  crashed: 'bg-status-crashed',
};

export function ServiceControl() {
  const statuses = useServiceStore((s) => s.statuses);
  const serverRoot = useAppStore((s) => s.serverRoot);
  // MySQL 连接状态
  const [mysql, setMysql] = useState<{ status: 'idle' | 'checking' | 'ok' | 'fail'; version?: string; error?: string }>({ status: 'idle' });
  // 在线人数
  const [online, setOnline] = useState<number | null>(null);
  // 各服务端口（从 conf 文件读取，null = 用默认值）
  const [ports, setPorts] = useState<Record<string, number | null>>({});

  const runningCount = Object.values(statuses).filter((s) => s.state === 'running').length;
  const crashedCount = Object.values(statuses).filter((s) => s.state === 'crashed').length;
  const anyRunning = runningCount > 0;

  // 服务端目录：本地用 store 缓存；远程时直接从主进程（→Agent）取
  const [displayRoot, setDisplayRoot] = useState(serverRoot);
  const targetKind = useAppStore((s) => s.target.kind);
  useEffect(() => {
    let cancelled = false;
    window.rosever.getServerRoot().then((r) => {
      if (!cancelled) setDisplayRoot(r ?? '');
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [targetKind]);

  // 从 conf 文件读取各服务端口（目录变化时重新读取）
  useEffect(() => {
    window.rosever.getServicePorts().then(setPorts).catch(() => { /* ignore */ });
  }, [displayRoot]);

  /** 检测 MySQL 连接 + 在线人数（页面加载时 + 每 30 秒刷新） */
  const checkHealth = useCallback(async () => {
    setMysql({ status: 'checking' });
    const cfg = await window.rosever.getDbConfig();
    const res = await window.rosever.testDb(cfg);
    if (res.ok) {
      setMysql({ status: 'ok', version: res.version });
      // 连接成功才查在线人数
      const onlineRes = await window.rosever.onlinePlayers(cfg);
      if (onlineRes.ok) setOnline((onlineRes.players as unknown[]).length);
      else setOnline(null);
    } else {
      setMysql({ status: 'fail', error: res.error });
      setOnline(null);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 30_000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  return (
    <PageWrapper
      title="服务控制"
      subtitle="启动、停止、重启各个服务，崩溃自动重启守护"
      actions={
        <>
          <button className="btn-outline" onClick={() => window.rosever.stopAll()} disabled={!anyRunning}>
            <Icon.Stop size={14} />
            全部停止
          </button>
          <button className="btn-primary" onClick={() => window.rosever.startAll()} disabled={anyRunning}>
            <Icon.Play size={14} />
            全部启动
          </button>
        </>
      }
    >
      {/* ---- 健康摘要状态条（原总览精华） ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SummaryCard
          icon="Power"
          label="服务运行"
          value={`${runningCount}/${SERVICES.length}`}
          accent={crashedCount > 0 ? 'crashed' : runningCount === SERVICES.length ? 'running' : 'normal'}
          sub={crashedCount > 0 ? `${crashedCount} 个崩溃` : undefined}
        />
        <SummaryCard
          icon="Database"
          label="MySQL"
          value={
            mysql.status === 'checking' ? '检测中' :
            mysql.status === 'ok' ? '已连接' :
            mysql.status === 'fail' ? '未连接' : '未检测'
          }
          accent={mysql.status === 'ok' ? 'running' : mysql.status === 'fail' ? 'crashed' : 'normal'}
          sub={mysql.status === 'ok' ? mysql.version : mysql.status === 'fail' ? mysql.error : undefined}
        />
        <SummaryCard
          icon="Server"
          label="在线人数"
          value={online === null ? '-' : String(online)}
          sub={online !== null && online > 0 ? '当前在线' : undefined}
          accent={online !== null && online > 0 ? 'running' : 'normal'}
        />
        <SummaryCard
          icon="Folder"
          label="服务端目录"
          value={displayRoot ? displayRoot.split(/[\\/]/).pop()! : '未配置'}
          sub={displayRoot}
          mono
        />
      </div>

      {/* ---- 服务列表（精细操作） ---- */}
      <div className="space-y-2">
        {SERVICES.map((meta) => {
          const st = statuses[meta.id];
          const running = st.state === 'running';
          const busy = st.state === 'starting' || st.state === 'stopping';
          const port = ports[meta.id] ?? meta.port;
          return (
            <div key={meta.id} className="card overflow-hidden">
              <div className="flex items-center justify-between gap-4 p-3">
                {/* 左：状态 + 名称 */}
                <div className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATE_DOT[st.state]}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meta.name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-active text-text-secondary">
                        {STATE_LABEL[st.state]}
                      </span>
                      {st.restartCount > 0 && (
                        <span className="text-[11px] text-status-warning" title="崩溃自动重启次数">
                          ↻ {st.restartCount}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5 flex items-center gap-3">
                      <span className="font-mono">{meta.exe}</span>
                      <span>:{port}</span>
                      {st.pid && <span>pid {st.pid}</span>}
                      {st.lastError && <span className="text-status-crashed truncate">{st.lastError}</span>}
                    </div>
                  </div>
                </div>

                {/* 右：操作 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {running && (
                    <button
                      className="btn-ghost"
                      onClick={() => window.rosever.restart(meta.id as ServiceId)}
                      disabled={busy}
                      title="重启"
                    >
                      <Icon.Refresh size={14} />
                    </button>
                  )}
                  {running ? (
                    <button
                      className="btn-outline border-status-crashed/50 text-status-crashed hover:bg-status-crashed/10 !py-1"
                      onClick={() => window.rosever.stop(meta.id as ServiceId)}
                      disabled={busy}
                    >
                      <Icon.Stop size={14} />
                      停止
                    </button>
                  ) : (
                    <button
                      className="btn-primary !py-1"
                      onClick={() => window.rosever.start(meta.id as ServiceId)}
                      disabled={busy}
                    >
                      <Icon.Play size={14} />
                      启动
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-text-muted mt-5 flex items-center gap-1.5">
        <Icon.Refresh size={12} />
        服务崩溃（退出码 &gt; 1）后将在 15 秒后自动重启，对应 serv.bat 守护逻辑。
        完整日志与历史记录请查看「日志」页。
      </p>
    </PageWrapper>
  );
}

/** 摘要小卡片 */
function SummaryCard({
  icon,
  label,
  value,
  sub,
  accent = 'normal',
  mono = false,
}: {
  icon: keyof typeof Icon;
  label: string;
  value: string;
  sub?: string;
  accent?: 'normal' | 'running' | 'crashed';
  mono?: boolean;
}) {
  const I = Icon[icon];
  const accentColor =
    accent === 'running' ? 'text-status-running' : accent === 'crashed' ? 'text-status-crashed' : 'text-text-primary';
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
        <I size={12} />
        {label}
      </div>
      <div className={`text-lg font-semibold ${accentColor} ${mono ? 'font-mono truncate' : ''}`} title={sub ?? value}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-text-muted truncate font-mono" title={sub}>{sub}</div>}
    </div>
  );
}
