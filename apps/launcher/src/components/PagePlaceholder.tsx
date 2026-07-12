import type { IconName } from './Icon';
import { Icon } from './Icon';

interface Props {
  icon: IconName;
  title: string;
  description: string;
}

/** P1 阶段通用页面占位 */
export function PagePlaceholder({ icon, title, description }: Props) {
  const I = Icon[icon];
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 rounded-full bg-bg-panel border border-border flex items-center justify-center mb-4">
        <I size={28} className="text-accent" />
      </div>
      <h2 className="text-lg font-semibold mb-1.5">{title}</h2>
      <p className="text-sm text-text-secondary max-w-md">{description}</p>
      <span className="mt-4 px-2 py-0.5 rounded text-[11px] bg-bg-panel text-text-muted border border-border">
        待实现
      </span>
    </div>
  );
}
