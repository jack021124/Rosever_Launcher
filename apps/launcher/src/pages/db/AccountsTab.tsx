import { useEffect, useState, useCallback } from 'react';
import type { MysqlConfig } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';

const PAGE_SIZE = 30;

interface Account {
  account_id: number;
  userid: string;
  sex: string;
  email: string;
  group_id: number;
  state: number;
  logincount: number;
  lastlogin: string | null;
  last_ip: string;
}
interface Char {
  char_id: number;
  account_id: number;
  name: string;
  class: number;
  base_level: number;
  job_level: number;
  zeny: number;
  online: number;
}

export function AccountsTab({ cfg }: { cfg: MysqlConfig }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [detailAcc, setDetailAcc] = useState<Account | null>(null);
  const [chars, setChars] = useState<Char[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const res = await window.rosever.listAccounts(cfg, page, PAGE_SIZE, search);
    setLoading(false);
    if (res.ok) {
      setAccounts(res.rows as Account[]);
      setTotal(res.total);
    } else setErr(res.error);
  }, [cfg, page, search]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (acc: Account) => {
    setDetailAcc(acc);
    const res = await window.rosever.listChars(cfg, acc.account_id);
    if (res.ok) setChars(res.chars as Char[]);
    else setChars([]);
  };

  const refreshDetail = async () => {
    if (detailAcc) await openDetail(detailAcc);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex gap-3 h-[calc(100%-20px)]">
      {/* 左：账号列表 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Icon.Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="input w-full pl-7 text-xs"
              placeholder="搜索 userid / email / IP…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
          <button className="btn-primary !py-1 !text-xs" onClick={() => setShowCreate(true)}>
            <Icon.Plus size={13} /> 注册
          </button>
        </div>

        {err && <div className="text-xs text-status-crashed mb-2">{err}</div>}

        <div className="card flex-1 overflow-auto">
          {loading ? (
            <div className="p-6 text-center text-text-muted text-sm">加载中…</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-panel">
                <tr>
                  {['ID', '账号', '性别', 'GM', '状态', '登录次数', '最后登录', '最后IP', '操作'].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 font-medium text-text-secondary border-b border-border whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.account_id} className={`hover:bg-bg-hover/40 ${detailAcc?.account_id === a.account_id ? 'bg-accent/10' : ''}`}>
                    <td className="px-2 py-1 font-mono text-text-muted">{a.account_id}</td>
                    <td className="px-2 py-1 text-text-primary">{a.userid}</td>
                    <td className="px-2 py-1">{a.sex}</td>
                    <td className="px-2 py-1">
                      <span className={a.group_id > 0 ? 'text-accent' : 'text-text-muted'}>{a.group_id}</span>
                    </td>
                    <td className="px-2 py-1">
                      {a.state === 5 ? <span className="text-status-crashed">封禁</span> : <span className="text-status-running">正常</span>}
                    </td>
                    <td className="px-2 py-1 text-text-muted">{a.logincount}</td>
                    <td className="px-2 py-1 text-text-muted whitespace-nowrap">{a.lastlogin ? String(a.lastlogin).slice(0, 19) : '-'}</td>
                    <td className="px-2 py-1 font-mono text-text-muted">{a.last_ip || '-'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <button className="text-accent hover:underline" onClick={() => openDetail(a)}>管理</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
            <span>共 {total} 条 · 第 {page}/{totalPages} 页</span>
            <div className="flex items-center gap-1">
              <button className="btn-ghost !py-0.5 !px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
              <button className="btn-ghost !py-0.5 !px-2" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
            </div>
          </div>
        )}
      </div>

      {/* 右：账号详情/操作面板 */}
      {detailAcc && (
        <div className="w-72 shrink-0 card p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{detailAcc.userid}</h3>
            <button className="text-text-muted hover:text-text-primary" onClick={() => setDetailAcc(null)}>✕</button>
          </div>
          <div className="space-y-1.5 text-xs mb-4">
            <Row label="账号ID" value={String(detailAcc.account_id)} />
            <Row label="邮箱" value={detailAcc.email || '-'} />
            <Row label="当前GM" value={String(detailAcc.group_id)} />
            <Row label="状态" value={detailAcc.state === 5 ? '封禁' : '正常'} />
          </div>

          {/* 操作 */}
          <div className="space-y-2 mb-4">
            <ActionRow label="GM 等级">
              <NumInput onSubmit={(v) => window.rosever.setGroup(cfg, detailAcc.account_id, v).then(load)} />
            </ActionRow>
            <ActionRow label="重置密码">
              <TextInput onSubmit={(v) => window.rosever.setPassword(cfg, detailAcc.account_id, v).then(() => alert('密码已重置'))} placeholder="新密码" />
            </ActionRow>
            <ActionRow label="封禁状态">
              <button
                className={`btn !py-0.5 !text-xs ${detailAcc.state === 5 ? 'btn-outline' : 'btn-primary'}`}
                onClick={async () => {
                  await window.rosever.setBan(cfg, detailAcc.account_id, detailAcc.state !== 5);
                  setDetailAcc({ ...detailAcc, state: detailAcc.state === 5 ? 0 : 5 });
                }}
              >
                {detailAcc.state === 5 ? '解封' : '封禁'}
              </button>
            </ActionRow>
          </div>

          {/* 角色 */}
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium text-text-secondary mb-2">角色 ({chars.length})</div>
            {chars.length === 0 ? (
              <div className="text-xs text-text-muted">无角色</div>
            ) : (
              <div className="space-y-2">
                {chars.map((c) => (
                  <div key={c.char_id} className="bg-bg-input/50 rounded p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1">
                        {c.online ? <span className="w-1.5 h-1.5 rounded-full bg-status-running" /> : null}
                        {c.name}
                      </span>
                      <span className="text-[10px] text-text-muted">Lv{c.base_level}/{c.job_level}</span>
                    </div>
                    <div className="text-[10px] text-text-muted mb-1.5">Zeny: {c.zeny.toLocaleString()}</div>
                    <div className="flex gap-1">
                      <NumInput
                        small
                        placeholder="改 Zeny"
                        onSubmit={async (v) => { await window.rosever.setZeny(cfg, c.char_id, v); refreshDetail(); }}
                      />
                      <button
                        className="btn !py-0.5 !px-1.5 !text-[10px] border border-status-crashed/40 text-status-crashed hover:bg-status-crashed/10"
                        onClick={async () => { if (confirm(`删除角色 ${c.name}？`)) { await window.rosever.deleteChar(cfg, c.char_id); refreshDetail(); } }}
                      >删</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn w-full mt-4 border border-status-crashed/40 text-status-crashed hover:bg-status-crashed/10 !py-1 !text-xs"
            onClick={async () => {
              if (confirm(`删除账号 ${detailAcc.userid} 及其所有角色？此操作不可恢复！`)) {
                await window.rosever.deleteAccount(cfg, detailAcc.account_id);
                setDetailAcc(null);
                load();
              }
            }}
          >
            删除整个账号
          </button>
        </div>
      )}

      {/* 注册账号弹窗 */}
      {showCreate && <CreateAccountModal cfg={cfg} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-mono">{value}</span>
    </div>
  );
}
function ActionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-text-muted">{label}</span>
      {children}
    </div>
  );
}
function NumInput({ onSubmit, placeholder, small }: { onSubmit: (v: number) => void; placeholder?: string; small?: boolean }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-1">
      <input
        type="number"
        className={`input ${small ? 'w-20' : 'w-24'} !py-0.5 text-xs`}
        placeholder={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && v) { onSubmit(Number(v)); setV(''); } }}
      />
    </div>
  );
}
function TextInput({ onSubmit, placeholder }: { onSubmit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState('');
  return (
    <input
      className="input w-28 !py-0.5 text-xs"
      placeholder={placeholder}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && v) { onSubmit(v); setV(''); } }}
    />
  );
}

function CreateAccountModal({ cfg, onClose, onCreated }: { cfg: MysqlConfig; onClose: () => void; onCreated: () => void }) {
  const [userid, setUserid] = useState('');
  const [pass, setPass] = useState('');
  const [sex, setSex] = useState<'M' | 'F'>('M');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!userid || !pass) { setErr('账号和密码必填'); return; }
    setBusy(true);
    const res = await window.rosever.createAccount(cfg, userid, pass, sex, email);
    setBusy(false);
    if (res.ok) onCreated();
    else setErr(res.error || '注册失败');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="card p-5 w-80" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-4">注册新账号</h3>
        <div className="space-y-3">
          <label className="block"><span className="text-[11px] text-text-muted block mb-1">账号 (userid)</span>
            <input className="input w-full text-xs" value={userid} onChange={(e) => setUserid(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-text-muted block mb-1">密码</span>
            <input type="password" className="input w-full text-xs" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" checked={sex === 'M'} onChange={() => setSex('M')} className="accent-accent" /> 男
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" checked={sex === 'F'} onChange={() => setSex('F')} className="accent-accent" /> 女
            </label>
          </div>
          <label className="block"><span className="text-[11px] text-text-muted block mb-1">邮箱 (可选)</span>
            <input className="input w-full text-xs" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        </div>
        {err && <div className="text-xs text-status-crashed mt-3">{err}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost !py-1 !text-xs" onClick={onClose}>取消</button>
          <button className="btn-primary !py-1 !text-xs" onClick={submit} disabled={busy}>{busy ? '注册中…' : '注册'}</button>
        </div>
      </div>
    </div>
  );
}
