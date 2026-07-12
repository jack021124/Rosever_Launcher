import { useAppStore } from '@/store/appStore';
import { Icon } from './Icon';

/** 首次启动 / 未配置服务端目录时的引导 */
export function SetupGuide() {
  const pickServerRoot = useAppStore((s) => s.pickServerRoot);

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="w-20 h-20 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center mb-6">
        <Icon.Folder size={36} className="text-accent" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">欢迎使用 Rosever</h1>
      <p className="text-sm text-text-secondary max-w-md mb-1">
        开始前，请选择 BetterRA / rAthena 服务端的根目录。
      </p>
      <p className="text-xs text-text-muted max-w-md mb-7">
        该目录应包含 <code className="text-text-secondary">login-server.exe</code>、
        <code className="text-text-secondary">char-server.exe</code> 等 exe 与
        <code className="text-text-secondary"> conf/</code> 目录。
      </p>
      <button className="btn-primary !px-5 !py-2.5" onClick={pickServerRoot}>
        <Icon.Folder size={16} />
        选择服务端目录
      </button>
      <p className="text-[11px] text-text-muted mt-6">
        提示：之后可在左下角的服务端目录处重新选择。
      </p>
    </div>
  );
}
