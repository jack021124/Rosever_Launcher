import { useEffect, useState } from 'react';
import { PageWrapper } from './PageWrapper';
import type { MysqlConfig } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';
import { ConnectTab } from './db/ConnectTab';
import { TablesTab } from './db/TablesTab';
import { AccountsTab } from './db/AccountsTab';
import { BackupTab } from './db/BackupTab';
import { useDbStore } from '@/store/dbStore';

type TabId = 'connect' | 'tables' | 'accounts' | 'backup';

const TABS: { id: TabId; label: string; icon: 'Database' | 'Server' | 'Folder' | 'Save' }[] = [
  { id: 'connect', label: '连接配置', icon: 'Database' },
  { id: 'tables', label: '数据表', icon: 'Server' },
  { id: 'accounts', label: '账号与玩家', icon: 'Folder' },
  { id: 'backup', label: '备份与导入', icon: 'Save' },
];

export function Database() {
  const [cfg, setCfg] = useState<MysqlConfig>({ host: '127.0.0.1', port: 3306, user: 'ragnarok', password: 'ragnarok', database: 'ragnarok' });
  // connected 走全局 store，切页不丢失
  const connected = useDbStore((s) => s.connected);
  const markConnected = useDbStore((s) => s.markConnected);
  const markDisconnected = useDbStore((s) => s.markDisconnected);
  const cfgUnchanged = useDbStore((s) => s.cfgUnchanged);
  const [tab, setTab] = useState<TabId>('connect');

  useEffect(() => {
    window.rosever.getDbConfig().then((c) => {
      setCfg(c);
      // 如果 cfg 和上次测试成功时一致，沿用 connected 状态；否则标记断开
      if (!cfgUnchanged(c)) markDisconnected();
    });
  }, []);

  return (
    <PageWrapper
      title="数据库"
      subtitle={connected ? `已连接 ${cfg.database}@${cfg.host}` : 'MySQL 数据库管理'}
      actions={
        <span
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
            connected ? 'bg-status-running/10 text-status-running' : 'bg-bg-active/60 text-text-muted'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-status-running status-dot-glow' : 'bg-status-stopped'}`}
          />
          {connected ? '已连接' : '未连接'}
        </span>
      }
    >
      {/* Tab 栏 */}
      <div className="tab-bar mb-4">
        {TABS.map((t) => {
          const I = Icon[t.icon];
          const disabled = t.id !== 'connect' && !connected;
          return (
            <button
              key={t.id}
              onClick={() => !disabled && setTab(t.id)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-all duration-150 ${
                tab === t.id
                  ? 'border-accent text-accent font-medium'
                  : disabled
                    ? 'border-transparent text-text-muted cursor-not-allowed'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <I size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab 内容 */}
      {tab === 'connect' && (
        <ConnectTab
          cfg={cfg}
          setCfg={setCfg}
          connected={connected}
          onConnected={(ok) => {
            if (ok) markConnected(cfg);
            else markDisconnected();
          }}
        />
      )}
      {tab === 'tables' && <TablesTab cfg={cfg} />}
      {tab === 'accounts' && <AccountsTab cfg={cfg} />}
      {tab === 'backup' && <BackupTab cfg={cfg} />}
    </PageWrapper>
  );
}
