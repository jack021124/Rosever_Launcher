import { Icon } from './Icon';

/** 顶部标题栏 */
export function TitleBar() {
  return (
    <header className="h-10 flex items-center justify-between px-3 bg-bg-panel border-b border-border select-none">
      {/* 左侧：logo + 名称 */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-white text-xs font-bold">
          R
        </div>
        <span className="text-sm font-semibold">Rosever Launcher</span>
        <span className="text-xs text-text-muted ml-1">v0.1.0</span>
      </div>

      {/* 右侧：保存按钮 */}
      <div className="flex items-center gap-2">
        <button className="btn-primary !py-1 !px-2.5 !text-xs">
          <Icon.Save size={13} />
          保存
        </button>
      </div>
    </header>
  );
}
