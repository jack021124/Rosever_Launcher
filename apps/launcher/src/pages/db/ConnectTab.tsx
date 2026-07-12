import { useState } from 'react';
import type { MysqlConfig } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';

interface Props {
  cfg: MysqlConfig;
  setCfg: (c: MysqlConfig) => void;
  connected: boolean;
  onConnected: (v: boolean) => void;
}

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; version?: string; error?: string };

export function ConnectTab({ cfg, setCfg, connected, onConnected }: Props) {
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [initing, setIniting] = useState(false);
  const [initResult, setInitResult] = useState<{ steps: { ok: boolean; file: string; error?: string }[]; createError?: string } | null>(null);

  const handleTest = async () => {
    setTest({ status: 'testing' });
    const res = await window.rosever.testDb(cfg);
    setTest(res.ok ? { status: 'ok', version: res.version } : { status: 'fail', error: res.error });
    onConnected(res.ok);
  };

  const handleInit = async () => {
    setIniting(true);
    setInitResult(null);
    const res = await window.rosever.initializeDb(cfg);
    setIniting(false);
    setInitResult(res);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Icon.Database size={15} className="text-accent" />
            MySQL 连接配置
          </h3>
          <span className="text-[11px] text-text-muted">读取自 conf/inter_athena.conf</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="主机地址">
            <input className="input w-full" value={cfg.host} onChange={(e) => { setCfg({ ...cfg, host: e.target.value }); onConnected(false); }} />
          </Field>
          <Field label="端口">
            <input type="number" className="input w-full" value={cfg.port} onChange={(e) => { setCfg({ ...cfg, port: Number(e.target.value) }); onConnected(false); }} />
          </Field>
          <Field label="用户名">
            <input className="input w-full" value={cfg.user} onChange={(e) => { setCfg({ ...cfg, user: e.target.value }); onConnected(false); }} />
          </Field>
          <Field label="密码">
            <input type="password" className="input w-full" value={cfg.password} onChange={(e) => { setCfg({ ...cfg, password: e.target.value }); onConnected(false); }} />
          </Field>
          <Field label="数据库名">
            <input className="input w-full" value={cfg.database} onChange={(e) => { setCfg({ ...cfg, database: e.target.value }); onConnected(false); }} />
          </Field>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button className="btn-outline" onClick={handleTest} disabled={test.status === 'testing'}>
            <Icon.Search size={14} />
            {test.status === 'testing' ? '测试中…' : '测试连接'}
          </button>
          {test.status === 'ok' && (
            <span className="text-xs text-status-running flex items-center gap-1">
              <Icon.Check size={13} /> 连接成功 {test.version && `· ${test.version}`}
            </span>
          )}
          {test.status === 'fail' && <span className="text-xs text-status-crashed">失败: {test.error}</span>}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Icon.Tool size={15} className="text-accent" />
          一键初始化数据库
        </h3>
        <p className="text-xs text-text-secondary mb-3">
          创建数据库 <code className="text-text-primary">{cfg.database}</code> 并导入以下文件：
        </p>
        <ul className="text-xs text-text-muted font-mono mb-4 space-y-1">
          <li>· sql-files/main.sql（主数据表）</li>
          <li>· sql-files/logs.sql（日志表）</li>
          <li>· sql-files/roulette_default_data.sql（轮盘默认数据）</li>
        </ul>
        <button className="btn-primary" onClick={handleInit} disabled={initing}>
          <Icon.Play size={14} />
          {initing ? '初始化中…' : '开始初始化'}
        </button>
        {initResult && (
          <div className="mt-4 space-y-1.5">
            {initResult.createError && <div className="text-xs text-status-crashed">建库失败: {initResult.createError}</div>}
            {initResult.steps.map((s) => (
              <div key={s.file} className="flex items-center gap-2 text-xs">
                <span className={s.ok ? 'text-status-running' : 'text-status-crashed'}>{s.ok ? '✓' : '✗'}</span>
                <span className="font-mono text-text-secondary">{s.file}</span>
                {s.error && <span className="text-status-crashed truncate">{s.error}</span>}
              </div>
            ))}
            {initResult.steps.length > 0 && initResult.steps.every((s) => s.ok) && (
              <div className="text-xs text-status-running pt-1">全部导入成功，数据库就绪。</div>
            )}
          </div>
        )}
      </div>

      {connected && (
        <p className="text-xs text-text-muted flex items-center gap-1.5">
          <Icon.Check size={12} className="text-status-running" />
          已连接，可切换到其他 Tab 管理数据库。
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-text-muted block mb-1">{label}</span>
      {children}
    </label>
  );
}
