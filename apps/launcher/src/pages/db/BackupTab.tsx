import { useState } from 'react';
import type { MysqlConfig } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';

/** 服务端自带的 sql 文件，方便快速导入 */
const QUICK_SQLS = [
  'sql-files/main.sql',
  'sql-files/logs.sql',
  'sql-files/roulette_default_data.sql',
  'sql-files/item_db.sql',
  'sql-files/mob_db.sql',
  'sql-files/web.sql',
];

export function BackupTab({ cfg }: { cfg: MysqlConfig }) {
  const [backing, setBacking] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [customSql, setCustomSql] = useState('');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleBackup = async () => {
    setBacking(true);
    setBackupMsg(null);
    const res = await window.rosever.backupDb(cfg);
    setBacking(false);
    setBackupMsg(res.ok ? { ok: true, text: '备份成功，已保存到选定位置' } : { ok: false, text: res.error || '备份失败' });
  };

  const handleImport = async (path: string) => {
    setBusy(true);
    setImportMsg(null);
    const res = await window.rosever.importSql(cfg, path);
    setBusy(false);
    setImportMsg(res.ok ? { ok: true, text: `已导入 ${res.file}` } : { ok: false, text: `${res.file} 导入失败: ${res.error}` });
  };

  return (
    <div className="max-w-2xl space-y-5">
      {/* 整库备份 */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Icon.Save size={15} className="text-accent" />
          整库备份
        </h3>
        <p className="text-xs text-text-secondary mb-3">
          使用 mysqldump 导出整个 <code className="text-text-primary">{cfg.database}</code> 数据库为 .sql 文件。
          需要系统已安装 MySQL（mysqldump 在 PATH 中）。
        </p>
        <button className="btn-primary" onClick={handleBackup} disabled={backing}>
          <Icon.Save size={14} />
          {backing ? '备份中…' : '选择位置并备份'}
        </button>
        {backupMsg && (
          <div className={`mt-3 text-xs ${backupMsg.ok ? 'text-status-running' : 'text-status-crashed'}`}>{backupMsg.text}</div>
        )}
      </div>

      {/* 导入 sql */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Icon.Tool size={15} className="text-accent" />
          导入 SQL 文件
        </h3>
        <p className="text-xs text-text-secondary mb-3">从服务端目录导入 sql 文件到当前数据库。</p>

        {/* 快捷导入 */}
        <div className="text-[11px] text-text-muted mb-1.5">快捷导入（服务端自带）：</div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {QUICK_SQLS.map((f) => (
            <button
              key={f}
              onClick={() => handleImport(f)}
              disabled={busy}
              className="px-2 py-1 rounded text-[11px] bg-bg-active text-text-secondary hover:bg-accent hover:text-white transition-colors font-mono disabled:opacity-50"
            >
              {f.split('/').pop()}
            </button>
          ))}
        </div>

        {/* 自定义路径 */}
        <div className="text-[11px] text-text-muted mb-1.5">自定义路径（相对服务端根目录）：</div>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-xs font-mono"
            placeholder="例如：sql-files/upgrades/upgrade_2024.sql"
            value={customSql}
            onChange={(e) => setCustomSql(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && customSql && handleImport(customSql)}
          />
          <button className="btn-primary !py-1 !text-xs" onClick={() => customSql && handleImport(customSql)} disabled={busy || !customSql}>
            导入
          </button>
        </div>

        {importMsg && (
          <div className={`mt-3 text-xs ${importMsg.ok ? 'text-status-running' : 'text-status-crashed'}`}>{importMsg.text}</div>
        )}
      </div>
    </div>
  );
}
