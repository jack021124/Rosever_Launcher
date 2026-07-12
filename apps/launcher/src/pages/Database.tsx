import { useEffect, useState } from 'react';
import { PageWrapper } from './PageWrapper';
import type { MysqlConfig } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';
import { ConnectTab } from './db/ConnectTab';
import { TablesTab } from './db/TablesTab';
import { AccountsTab } from './db/AccountsTab';
import { BackupTab } from './db/BackupTab';

type TabId = 'connect' | 'tables' | 'accounts' | 'backup';

const TABS: { id: TabId; label: string; icon: 'Database' | 'Server' | 'Folder' | 'Save' }[] = [
  { id: 'connect', label: '连接配置', icon: 'Database' },
  { id: 'tables', label: '数据表', icon: 'Server' },
  { id: 'accounts', label: '账号与玩家', icon: 'Folder' },
  { id: 'backup', label: '备份与导入', icon: 'Save' },
];

export function Database() {
  const [cfg, setCfg] = useState<MysqlConfig>({ host: '127.0.0.1', port: 3306, user: 'ragnarok', password: 'ragnarok', database: 'ragnarok' });
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<TabId>('connect');

  useEffect(() => {
    window.rosever.getDbConfig().then((c) => setCfg(c));
  }, []);

  return (
    <PageWrapper
      title="数据库"
      subtitle={connected ? `已连接 ${cfg.database}@${cfg.host}` : 'MySQL 数据库管理'}
      actions={
        <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-status-running' : 'text-text-muted'}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-status-running' : 'bg-status-stopped'}`} />
          {connected ? '已连接' : '未连接'}
        </span>
      }
    >
      {/* Tab 栏 */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {TABS.map((t) => {
          const I = Icon[t.icon];
          const disabled = t.id !== 'connect' && !connected;
          return (
            <button
              key={t.id}
              onClick={() => !disabled && setTab(t.id)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-accent text-accent'
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
        <ConnectTab cfg={cfg} setCfg={setCfg} connected={connected} onConnected={setConnected} />
      )}
      {tab === 'tables' && <TablesTab cfg={cfg} />}
      {tab === 'accounts' && <AccountsTab cfg={cfg} />}
      {tab === 'backup' && <BackupTab cfg={cfg} />}
    </PageWrapper>
  );
}
