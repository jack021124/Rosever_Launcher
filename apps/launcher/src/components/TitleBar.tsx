import { useState, useEffect } from 'react';

/**
 * 自定义标题栏（无边框窗口用，ZCode 风格）。
 * - 整条标题栏可拖动移动窗口（-webkit-app-region: drag）
 * - 右侧三个按钮（最小化/最大化/关闭）不参与拖动（no-drag），点击触发窗口控制
 * - 双击标题栏空白处切换最大化
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    // 初始查询一次
    window.rosever.winIsMaximized().then(setMaximized);
    // 订阅最大化状态变化（拖窗口到顶部最大化等系统操作）
    const off = window.rosever.onMaximizeChange(setMaximized);
    return () => {
      off();
    };
  }, []);

  const handleMaximizeToggle = async () => {
    await window.rosever.winMaximize();
    // 切换后刷新状态
    setMaximized(await window.rosever.winIsMaximized());
  };

  return (
    <header
      className="h-9 flex items-center justify-between px-3 bg-bg-panel border-b border-border select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={handleMaximizeToggle}
    >
      {/* 左侧：logo + 名称 */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-accent flex items-center justify-center text-white text-[10px] font-bold">
          R
        </div>
        <span className="text-xs font-semibold text-text-primary">Rosever Launcher</span>
        <span className="text-[10px] text-text-muted ml-1">v0.1.0</span>
      </div>

      {/* 右侧：窗口控制按钮（不参与拖动） */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* 最小化 */}
        <button
          onClick={() => window.rosever.winMinimize()}
          className="w-7 h-6 flex items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          title="最小化"
        >
          <svg width="11" height="11" viewBox="0 0 11 11">
            <rect x="1" y="5.5" width="9" height="1" fill="currentColor" />
          </svg>
        </button>
        {/* 最大化/还原 */}
        <button
          onClick={handleMaximizeToggle}
          className="w-7 h-6 flex items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          title={maximized ? '还原' : '最大化'}
        >
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor">
              <rect x="1.5" y="3" width="6" height="6" strokeWidth="1" />
              <path d="M3.5 3V1.5H9.5V7.5H8" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor">
              <rect x="1.5" y="1.5" width="8" height="8" strokeWidth="1" />
            </svg>
          )}
        </button>
        {/* 关闭 */}
        <button
          onClick={() => window.rosever.winClose()}
          className="w-7 h-6 flex items-center justify-center rounded text-text-secondary hover:bg-status-crashed hover:text-white transition-colors"
          title="关闭"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" stroke="currentColor" strokeWidth="1.2">
            <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" />
          </svg>
        </button>
      </div>
    </header>
  );
}
