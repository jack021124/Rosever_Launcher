import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** 统一页面外壳：标题 + 操作区 + 内容 */
export function PageWrapper({ title, subtitle, actions, children }: Props) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="page-header px-5 pt-5">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="flex-1 overflow-auto p-5">{children}</div>
    </div>
  );
}
