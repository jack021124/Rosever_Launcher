import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { TitleBar } from '@/components/TitleBar';
import { TargetSwitcher } from '@/components/TargetSwitcher';
import { SideNav } from '@/components/SideNav';
import { useServiceEvents } from '@/hooks/useServiceEvents';
import { useAppStore, mapTargetStatus } from '@/store/appStore';
import { SetupGuide } from '@/components/SetupGuide';
import { ServiceControl } from '@/pages/ServiceControl';
import { Config } from '@/pages/Config';
import { NpcScripts } from '@/pages/NpcScripts';
import { Database } from '@/pages/Database';
import { Logs } from '@/pages/Logs';
import { Servers } from '@/pages/Servers';
import { DataTools, MapTools } from '@/pages/Tools';
import { Settings } from '@/pages/Settings';

export default function App() {
  // 订阅进程事件 → zustand
  useServiceEvents();

  const target = useAppStore((s) => s.target);
  const serverRootReady = useAppStore((s) => s.serverRootReady);
  const loadServerRoot = useAppStore((s) => s.loadServerRoot);
  const setConnState = useAppStore((s) => s.setConnState);
  const isRemote = target.kind === 'remote';

  // 启动时加载本地 serverRoot
  useEffect(() => {
    loadServerRoot();
  }, [loadServerRoot]);

  // 订阅远程连接状态推送 → 更新 store
  useEffect(() => {
    const off = window.rosever.onTargetStatus((s) => {
      setConnState(mapTargetStatus(s.state), 'detail' in s ? s.detail : undefined);
    });
    return () => {
      off();
    };
  }, [setConnState]);

  // target 切回本地时重新加载本地 serverRoot（远程模式下远程 serverRoot 由 Agent 提供）
  useEffect(() => {
    if (!isRemote) loadServerRoot();
  }, [isRemote, loadServerRoot]);

  // 远程模式下放行 routes（无需本地 serverRoot）；本地模式仍要求配置好目录
  const ready = serverRootReady || isRemote;
  const location = useLocation();

  return (
    <div className="h-full flex flex-col">
      <TitleBar />
      {/* 远程管理屏蔽：TargetSwitcher 当前返回 null，渲染无效果。恢复时去掉 TargetSwitcher 内的 return null */}
      <TargetSwitcher />
      <div className="flex-1 flex overflow-hidden">
        <SideNav />
        <main
          className="flex-1 min-h-0 overflow-hidden bg-bg-base"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 80% 50% at 50% 0%, rgb(var(--bg-panel) / 0.5), transparent 70%)',
          }}
        >
          {ready ? (
            <div key={location.pathname} className="h-full animate-fade-in">
              <Routes location={location}>
                <Route path="/" element={<ServiceControl />} />
                <Route path="/config" element={<Config />} />
                <Route path="/npc" element={<NpcScripts />} />
                <Route path="/database" element={<Database />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/servers" element={<Servers />} />
                <Route path="/tools/data" element={<DataTools />} />
                <Route path="/tools/map" element={<MapTools />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </div>
          ) : (
            <SetupGuide />
          )}
        </main>
      </div>
    </div>
  );
}
