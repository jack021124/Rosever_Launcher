import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useAppStore } from '@/store/appStore';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: '服务端',
    items: [
      { to: '/', label: '服务控制', icon: 'Power' },
      { to: '/config', label: '配置', icon: 'Settings' },
      { to: '/npc', label: '脚本配置', icon: 'Script' },
      { to: '/database', label: '数据库', icon: 'Database' },
      { to: '/logs', label: '日志', icon: 'Log' },
    ],
  },
  // 「远程」分组暂时屏蔽（远程管理功能保留代码，仅隐藏 UI 入口）
  // {
  //   title: '远程',
  //   items: [
  //     { to: '/servers', label: '服务器管理', icon: 'Server' },
  //   ],
  // },
  {
    title: '工具',
    items: [
      { to: '/tools/data', label: '数据工具', icon: 'Tool' },
      { to: '/tools/map', label: '地图工具', icon: 'Map' },
    ],
  },
  {
    title: '系统',
    items: [
      { to: '/settings', label: '设置', icon: 'Settings' },
    ],
  },
];

/** 侧边导航：分组 + 子项 */
export function SideNav() {
  const serverRoot = useAppStore((s) => s.serverRoot);
  const pickServerRoot = useAppStore((s) => s.pickServerRoot);

  return (
    <aside className="w-52 shrink-0 bg-bg-panel border-r border-border flex flex-col">
      <nav className="flex-1 overflow-y-auto py-3">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-2">
            <div className="px-4 py-1.5 text-[10px] font-semibold uppercase text-text-muted/70 tracking-[0.1em]">
              {group.title}
            </div>
            {group.items.map((item) => {
              const I = Icon[item.icon];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2.5 mx-2 px-2.5 py-1.5 rounded-md text-sm transition-all duration-150 ease-out-soft ${
                      isActive
                        ? 'bg-accent/15 text-accent font-medium shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.2)]'
                        : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:translate-x-0.5'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* 激活态左侧小药丸指示器（垂直居中） */}
                      <span
                        className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-accent transition-opacity duration-150 ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <I size={15} className={isActive ? 'text-accent' : 'text-text-muted group-hover:text-current'} />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 底部：服务端根目录（点击可重新选择） */}
      <button
        onClick={pickServerRoot}
        className="text-left p-3 border-t border-border text-[11px] text-text-muted hover:bg-bg-hover transition-colors"
        title="点击重新选择服务端目录"
      >
        <div className="flex items-center gap-1 mb-1">
          <Icon.Folder size={12} />
          <span>服务端目录</span>
        </div>
        <div
          className="truncate text-text-secondary font-mono text-[10px] bg-bg-input/50 rounded px-1.5 py-0.5"
          title={serverRoot}
        >
          {serverRoot || '未配置'}
        </div>
      </button>
    </aside>
  );
}
