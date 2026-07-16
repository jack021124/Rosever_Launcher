import { useState, useEffect, useCallback } from 'react';
import type { MysqlConfig, BackupSchedule } from '@rosever/shared/types';
import { Icon, type IconName } from '@/components/Icon';

/** 服务端自带的 sql 文件，方便快速导入 */
const QUICK_SQLS = [
  'sql-files/main.sql',
  'sql-files/logs.sql',
  'sql-files/roulette_default_data.sql',
  'sql-files/item_db.sql',
  'sql-files/mob_db.sql',
  'sql-files/web.sql',
];

const INTERVAL_PRESETS = [6, 12, 24, 48];

/** 格式化时间戳为可读时间 */
function fmtTime(ms: number): string {
  if (!ms) return '从未备份';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 定时备份卡片 —— 整库 / 日志表复用同一组件 */
function ScheduleCard({
  title,
  description,
  icon,
  getSchedule,
  setSchedule,
  runNow,
}: {
  title: string;
  description: string;
  icon: IconName;
  getSchedule: () => Promise<BackupSchedule>;
  setSchedule: (s: BackupSchedule) => Promise<{ ok: boolean }>;
  runNow: () => Promise<{ ok: boolean; error?: string; filePath?: string }>;
}) {
  const [schedule, setScheduleState] = useState<BackupSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setScheduleState(await getSchedule());
  }, [getSchedule]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!schedule) return;
    if (schedule.enabled && !schedule.dir) {
      setMsg({ ok: false, text: '请先选择备份目录' });
      return;
    }
    if (schedule.enabled && schedule.intervalHours <= 0) {
      setMsg({ ok: false, text: '间隔必须大于 0 小时' });
      return;
    }
    setSaving(true);
    setMsg(null);
    await setSchedule(schedule);
    setSaving(false);
    setMsg({ ok: true, text: '设置已保存，调度器已更新' });
    load();
  };

  const handlePickDir = async () => {
    const res = await window.rosever.pickBackupDir();
    if (res.canceled || !res.dir) return;
    setScheduleState((s) => (s ? { ...s, dir: res.dir! } : s));
  };

  const handleRunNow = async () => {
    if (!schedule?.dir) {
      setMsg({ ok: false, text: '请先选择备份目录并保存' });
      return;
    }
    setRunning(true);
    setMsg(null);
    const res = await runNow();
    setRunning(false);
    if (res.ok) {
      setMsg({ ok: true, text: `已备份: ${res.filePath}` });
      load();
    } else {
      setMsg({ ok: false, text: res.error || '备份失败' });
    }
  };

  const I = Icon[icon];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <I size={15} className="text-accent" />
          {title}
        </h3>
        {schedule && (
          <button
            onClick={() => setScheduleState((s) => (s ? { ...s, enabled: !s.enabled } : s))}
            className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
              schedule.enabled ? 'bg-accent justify-end' : 'bg-border-strong justify-start'
            }`}
            title={schedule.enabled ? '已启用' : '已关闭'}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow shrink-0" />
          </button>
        )}
      </div>
      <p className="text-xs text-text-secondary mb-3">{description}</p>

      {schedule && (
        <div className={`space-y-3 ${schedule.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          {/* 备份目录 */}
          <div>
            <label className="text-[11px] text-text-muted mb-1 block">备份目录</label>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-xs font-mono"
                placeholder="选择或输入备份目录绝对路径"
                value={schedule.dir}
                onChange={(e) => setScheduleState((s) => (s ? { ...s, dir: e.target.value } : s))}
              />
              <button className="btn-outline !py-1 !text-xs" onClick={handlePickDir}>
                <Icon.Folder size={13} />
                浏览
              </button>
            </div>
          </div>

          {/* 间隔 */}
          <div>
            <label className="text-[11px] text-text-muted mb-1 block">备份间隔（小时）</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                className="input w-24 text-xs"
                value={schedule.intervalHours}
                onChange={(e) =>
                  setScheduleState((s) => (s ? { ...s, intervalHours: Math.max(1, Number(e.target.value) || 1) } : s))
                }
              />
              <div className="flex gap-1">
                {INTERVAL_PRESETS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setScheduleState((s) => (s ? { ...s, intervalHours: h } : s))}
                    className={`px-2 py-1 rounded text-[11px] transition-colors ${
                      schedule.intervalHours === h
                        ? 'bg-accent text-white'
                        : 'bg-bg-active text-text-secondary hover:bg-bg-hover'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 上次备份时间 */}
          <div className="text-[11px] text-text-muted">
            上次备份：<span className="text-text-secondary">{fmtTime(schedule.lastBackup)}</span>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-1">
            <button className="btn-primary !py-1 !text-xs" onClick={handleSave} disabled={saving}>
              <Icon.Save size={13} />
              {saving ? '保存中…' : '保存设置'}
            </button>
            <button className="btn-ghost !py-1 !text-xs" onClick={handleRunNow} disabled={running || !schedule.dir}>
              <Icon.Play size={13} />
              {running ? '备份中…' : '立即备份一次'}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`mt-3 text-xs ${msg.ok ? 'text-status-running' : 'text-status-crashed'}`}>{msg.text}</div>
      )}
    </div>
  );
}

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
      {/* 整库自动备份 */}
      <ScheduleCard
        title="整库自动备份"
        description="按设定间隔用 mysqldump 导出整个数据库。应用需保持运行；重启后会根据上次备份时间自动补备。"
        icon="Database"
        getSchedule={window.rosever.getBackupSchedule}
        setSchedule={window.rosever.setBackupSchedule}
        runNow={window.rosever.runBackupNow}
      />

      {/* 日志表自动备份 */}
      <ScheduleCard
        title="日志表自动备份"
        description="单独备份 10 张日志表（atcommandlog / picklog / zenylog / loginlog 等）。日志体积大、增长快，建议与整库分开、更频繁地备份。"
        icon="Log"
        getSchedule={window.rosever.getLogBackupSchedule}
        setSchedule={window.rosever.setLogBackupSchedule}
        runNow={window.rosever.runLogBackupNow}
      />

      {/* 手动整库备份（选位置） */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Icon.Save size={15} className="text-accent" />
          手动备份
        </h3>
        <p className="text-xs text-text-secondary mb-3">
          使用 mysqldump 导出整个 <code className="text-text-primary">{cfg.database}</code> 数据库为 .sql 文件，
          弹窗选择保存位置。需要系统已安装 MySQL（mysqldump 在 PATH 中）。
        </p>
        <button className="btn-primary" onClick={handleBackup} disabled={backing}>
          <Icon.Save size={14} />
          {backing ? '备份中…' : '选择位置并备份'}
        </button>
        {backupMsg && (
          <div className={`mt-3 text-xs ${backupMsg.ok ? 'text-status-running' : 'text-status-crashed'}`}>
            {backupMsg.text}
          </div>
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
