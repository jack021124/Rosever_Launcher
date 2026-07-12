import { useState } from 'react';
import { PageWrapper } from './PageWrapper';
import { Icon } from '@/components/Icon';
import { useAppStore, type Target } from '@/store/appStore';

/** 单个服务器的测试结果 */
interface TestResult {
  ok: boolean;
  agentVersion?: string;
  serverRoot?: string;
  error?: string;
  at: number;
}

export function Servers() {
  const { targets, target, addTarget, removeTarget, switchTarget, connState } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('7890');
  const [token, setToken] = useState('');
  // 每个远程 target id 的测试结果
  const [results, setResults] = useState<Record<string, TestResult | 'testing'>>({});

  const doAdd = () => {
    if (!name.trim() || !host.trim() || !token.trim()) return;
    addTarget({ name: name.trim(), host: host.trim(), port: Number(port) || 7890, token: token.trim() });
    setName(''); setHost(''); setPort('7890'); setToken('');
    setShowAdd(false);
  };

  const doTest = async (t: Extract<Target, { kind: 'remote' }>) => {
    setResults((r) => ({ ...r, [t.id]: 'testing' }));
    const res = await window.rosever.testTarget({ host: t.host, port: t.port, token: t.token });
    setResults((r) => ({ ...r, [t.id]: { ...res, at: Date.now() } }));
  };

  const remotes = targets.filter((t): t is Extract<Target, { kind: 'remote' }> => t.kind === 'remote');

  return (
    <PageWrapper
      title="服务器管理"
      subtitle="配置与远程服务器的连接，添加后可在顶部快速切换"
      actions={
        <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
          <Icon.Plus size={14} />
          添加服务器
        </button>
      }
    >
      {/* 添加表单 */}
      {showAdd && (
        <div className="card p-4 mb-4 space-y-3">
          <div className="text-sm font-medium text-text-primary">添加远程服务器</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">名称</label>
              <input
                className="input w-full text-sm"
                placeholder="如：生产服 / 测试服"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] text-text-muted mb-1">IP / 域名</label>
                <input
                  className="input w-full text-sm"
                  placeholder="如：192.168.1.100"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">端口</label>
                <input
                  className="input w-full text-sm"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Token（与服务器 agent.json 一致）</label>
            <input
              className="input w-full text-sm font-mono"
              placeholder="长随机串"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-outline" onClick={() => setShowAdd(false)}>取消</button>
            <button
              className="btn-primary"
              onClick={doAdd}
              disabled={!name.trim() || !host.trim() || !token.trim()}
            >
              添加
            </button>
          </div>
        </div>
      )}

      {/* 本地项 */}
      <div className="card mb-3 p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded bg-bg-active flex items-center justify-center text-text-secondary shrink-0">
          <Icon.Folder size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary font-medium">本地服务端</div>
          <div className="text-[11px] text-text-muted">直接操作本机的 BetterRA 服务端</div>
        </div>
        {target.kind === 'local' ? (
          <span className="text-[11px] px-2 py-0.5 rounded bg-accent/20 text-accent">当前</span>
        ) : (
          <button className="btn-outline !py-1 !text-xs" onClick={() => switchTarget({ kind: 'local', name: '本地' })}>
            切换
          </button>
        )}
      </div>

      {/* 远程服务器列表 */}
      {remotes.length === 0 ? (
        <div className="card p-8 text-center text-text-muted text-sm">
          还没有配置远程服务器。点击右上角「添加服务器」开始。
        </div>
      ) : (
        remotes.map((t) => {
          const isActive = target.kind === 'remote' && target.id === t.id;
          const res = results[t.id];
          return (
            <div key={t.id} className="card mb-3 p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded bg-bg-active flex items-center justify-center text-text-secondary shrink-0">
                  <Icon.Server size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary font-medium truncate">{t.name}</span>
                    {isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">当前</span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-muted font-mono truncate">
                    {t.host}:{t.port}
                  </div>
                </div>
                {/* 状态徽章 */}
                {isActive && (
                  <span className={`text-[11px] px-2 py-0.5 rounded ${connBadgeClass(connState)}`}>
                    {connLabel(connState)}
                  </span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="btn-outline !py-1 !px-2 !text-xs"
                    onClick={() => doTest(t)}
                    disabled={res === 'testing'}
                    title="测试连接"
                  >
                    {res === 'testing' ? '测试中…' : '测试'}
                  </button>
                  {!isActive && (
                    <button className="btn-outline !py-1 !px-2 !text-xs" onClick={() => switchTarget(t)}>
                      切换
                    </button>
                  )}
                  <button
                    className="w-7 h-7 rounded flex items-center justify-center text-text-muted hover:bg-status-error/20 hover:text-status-error transition-colors"
                    onClick={() => {
                      if (confirm(`确定删除服务器「${t.name}」吗？`)) {
                        removeTarget(t.id);
                        setResults((r) => { const c = { ...r }; delete c[t.id]; return c; });
                      }
                    }}
                    title="删除"
                  >
                    <span className="text-base leading-none">×</span>
                  </button>
                </div>
              </div>

              {/* 测试结果详情 */}
              {res !== 'testing' && res !== undefined && (
                <div className={`mt-2 pt-2 border-t border-border/40 text-[11px] ${res.ok ? 'text-status-running' : 'text-status-error'}`}>
                  {res.ok ? (
                    <span>
                      ✓ 连接成功 · Agent v{res.agentVersion} · 目录 {res.serverRoot}
                    </span>
                  ) : (
                    <span>✗ {res.error}</span>
                  )}
                  <span className="text-text-muted ml-2">（{new Date(res.at).toLocaleTimeString()}）</span>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* 帮助提示 */}
      <div className="mt-4 p-3 rounded bg-bg-panel/40 border border-border/40 text-[11px] text-text-muted leading-relaxed">
        <div className="flex items-start gap-2">
          <Icon.Help size={13} className="mt-0.5 shrink-0" />
          <div>
            服务器端需先部署 <span className="text-text-secondary font-mono">Rosever Agent</span> 并配置相同的 Token。
            添加后点击「切换」即可让服务控制 / 配置 / 数据库等所有页面操作该服务器。
            详见 <span className="font-mono">apps/agent/README.md</span>。
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

/** 连接状态 → 徽章样式 */
function connBadgeClass(s: string): string {
  switch (s) {
    case 'connected':
      return 'bg-status-running/20 text-status-running';
    case 'connecting':
    case 'authenticating':
      return 'bg-status-warning/20 text-status-warning';
    case 'rejected':
      return 'bg-status-error/20 text-status-error';
    default:
      return 'bg-bg-active text-text-muted';
  }
}

function connLabel(s: string): string {
  switch (s) {
    case 'connected':
      return '已连接';
    case 'connecting':
    case 'authenticating':
      return '连接中';
    case 'disconnected':
      return '已断开';
    case 'rejected':
      return '被拒绝';
    case 'bye':
      return '已下线';
    default:
      return '未知';
  }
}
