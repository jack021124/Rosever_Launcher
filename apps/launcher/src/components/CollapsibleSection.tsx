import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  /** 分组标题 */
  label: string;
  /** 鼠标悬停时显示的完整路径/说明 */
  title?: string;
  /** 折叠区内容 */
  children: ReactNode;
  /** 默认是否展开（默认 true） */
  defaultOpen?: boolean;
}

/**
 * 可折叠分组：标题栏带一个旋转的箭头，点击展开/折叠。
 * 用于「配置」「脚本配置」页左侧导航的分组。
 * 折叠状态内部自管，每个分组独立。
 */
export function CollapsibleSection({ label, title, children, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1 px-1 mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
        title={title ?? label}
      >
        <Icon.Chevron
          size={12}
          className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <span className="truncate">{label}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
