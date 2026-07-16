import { useState } from 'react';
import { useAppStore, type Target, type ConnState } from '@/store/appStore';
import { Icon } from '@/components/Icon';

/**
 * 本地/远程目标切换条。
 *
 * ⚠ 远程管理功能暂时屏蔽 —— 整个切换条不渲染。
 * 远程逻辑代码（appStore/remoteBridge/main routed）全部保留，
 * 恢复时去掉下面这行 return null 即可。
 */
export function TargetSwitcher() {
  return null;
}

/** 连接状态 → 圆点颜色 + 中文 */
function connVisual(s: ConnState): { color: string; label: string } {
  switch (s) {
    case 'connected':
      return { color: 'bg-status-running', label: '已连接' };
    case 'connecting':
    case 'authenticating':
      return { color: 'bg-status-warning animate-pulse', label: '连接中' };
    case 'disconnected':
      return { color: 'bg-status-stopped', label: '已断开' };
    case 'rejected':
      return { color: 'bg-status-error', label: '被拒绝' };
    case 'bye':
      return { color: 'bg-status-stopped', label: '已下线' };
    case 'local':
    default:
      return { color: 'bg-status-running', label: '' };
  }
}

// 远程管理屏蔽前的实现（保留备用，恢复时把上面 return null 的 TargetSwitcher 删掉、
// 把本函数改回 export function TargetSwitcher 即可）
export function _TargetSwitcherImpl() {
  const { target, targets, connState, connDetail, switchTarget, addTarget, removeTarget } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  // 添加表单
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('7890');
  const [token, setToken] = useState('');

  const doAdd = () => {
    if (!name.trim() || !host.trim() || !token.trim()) return;
    addTarget({
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 7890,
      token: token.trim(),
    });
    // 清表单
    setName(''); setHost(''); setPort('7890'); setToken('');
    setShowAdd(false);
  };

  return (
    <div className="flex items-center gap-1 px-2 h-9 bg-bg-panel/60 border-b border-border overflow-x-auto">
      <span className="text-xs text-text-muted mr-1 shrink-0">目标:</span>
      {targets.map((t) => {
        const active = targetKindMatch(target, t);
        const isLocal = t.kind === 'local';
        // 仅当前选中的 remote 才显示真实连接状态；非选中项显示离线灰点
        const showConnState = active && !isLocal ? connState : isLocal ? 'local' : 'bye';
        const vis = connVisual(showConnState);
        return (
          <div key={t.kind === 'remote' ? t.id : 'local'} className="relative group flex items-center">
            <button
              onClick={() => switchTarget(t)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                active
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
              title={t.kind === 'remote' ? `${t.host}:${t.port}` : '本地服务端'}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${vis.color}`} />
              <span className="whitespace-nowrap">{t.name}</span>
            </button>
            {/* 删除按钮（仅 remote，hover 时显示） */}
            {t.kind === 'remote' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定删除服务器「${t.name}」吗？`)) removeTarget(t.id);
                }}
                className="ml-0.5 w-4 h-4 rounded flex items-center justify-center text-text-muted hover:bg-status-error/20 hover:text-status-error opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除"
              >
                <span className="text-[11px] leading-none">×</span>
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={() => setShowAdd((v) => !v)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
          showAdd ? 'bg-bg-hover text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
        }`}
        title="添加远程服务器"
      >
        <Icon.Plus size={12} />
        添加
      </button>

      {/* 连接状态文字 */}
      {target.kind === 'remote' && (
        <span className="ml-auto text-[11px] text-text-muted shrink-0 pr-2">
          {connVisual(connState).label}
          {connDetail ? ` · ${connDetail}` : ''}
        </span>
      )}

      {/* 添加表单弹层 */}
      {showAdd && (
        <div className="absolute top-9 left-2 z-50 w-72 card p-3 shadow-xl space-y-2">
          <div className="text-xs font-medium text-text-primary">添加远程服务器</div>
          <input
            className="input w-full text-xs"
            placeholder="名称（如：生产服）"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="input flex-1 text-xs"
              placeholder="IP / 域名"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <input
              className="input w-16 text-xs"
              placeholder="端口"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
          <input
            className="input w-full text-xs"
            placeholder="Token（与 agent.json 一致）"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => setShowAdd(false)}
              className="px-2.5 py-1 rounded text-xs text-text-secondary hover:bg-bg-hover"
            >
              取消
            </button>
            <button
              onClick={doAdd}
              disabled={!name.trim() || !host.trim() || !token.trim()}
              className="px-2.5 py-1 rounded text-xs bg-accent text-white disabled:opacity-40 hover:bg-accent-hover"
            >
              添加
            </button>
          </div>
          <div className="text-[10px] text-text-muted leading-relaxed pt-1 border-t border-border/40">
            服务器端需先部署 Rosever Agent 并配置相同的 Token，详见 Agent README。
          </div>
        </div>
      )}
    </div>
  );
}

/** 判断两个 target 是否是同一个（用 id 或 kind） */
function targetKindMatch(a: Target, b: Target): boolean {
  if (a.kind === 'local' && b.kind === 'local') return true;
  if (a.kind === 'remote' && b.kind === 'remote') return a.id === b.id;
  return false;
}

export type { Target };
