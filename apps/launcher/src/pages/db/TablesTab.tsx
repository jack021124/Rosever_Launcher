import { useEffect, useState, useCallback } from 'react';
import type { MysqlConfig } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';

const PAGE_SIZE = 50;

export function TablesTab({ cfg }: { cfg: MysqlConfig }) {
  const [tables, setTables] = useState<{ name: string; rows: number; sizeMB: number }[]>([]);
  const [activeTable, setActiveTable] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ columns: string[]; rows: string[][]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const loadTables = useCallback(async () => {
    const res = await window.rosever.listTables(cfg);
    if (res.ok) {
      setTables(res.tables);
      if (res.tables[0] && !activeTable) setActiveTable(res.tables[0].name);
    } else {
      setErr(res.error);
    }
  }, [cfg, activeTable]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const loadData = useCallback(async () => {
    if (!activeTable) return;
    setLoading(true);
    setErr('');
    const res = await window.rosever.queryTable(cfg, activeTable, page, PAGE_SIZE, search);
    setLoading(false);
    if (res.ok) setData(res.data);
    else setErr(res.error);
  }, [cfg, activeTable, page, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex gap-3 h-[calc(100%-20px)]">
      {/* 左：表列表 */}
      <div className="w-52 shrink-0 overflow-y-auto">
        <div className="text-[11px] text-text-muted mb-1 px-1">{tables.length} 张表</div>
        {tables.map((t) => (
          <button
            key={t.name}
            onClick={() => { setActiveTable(t.name); setPage(1); setSearch(''); }}
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors mb-0.5 ${
              activeTable === t.name ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-bg-hover'
            }`}
          >
            <div className="truncate font-mono text-xs">{t.name}</div>
            <div className="text-[10px] text-text-muted">{t.rows} 行 · {t.sizeMB}MB</div>
          </button>
        ))}
      </div>

      {/* 右：表数据 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Icon.Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="input w-full pl-7 text-xs"
              placeholder={`搜索 ${activeTable}…`}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
            />
          </div>
          <button className="btn-ghost !py-1" onClick={loadData}>
            <Icon.Refresh size={13} /> 刷新
          </button>
        </div>

        {err && <div className="text-xs text-status-crashed mb-2">{err}</div>}

        <div className="card flex-1 overflow-auto selectable">
          {loading ? (
            <div className="p-6 text-center text-text-muted text-sm">加载中…</div>
          ) : data && data.rows.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-panel">
                <tr>
                  {data.columns.map((c) => (
                    <th key={c} className="text-left px-2 py-1.5 font-medium text-text-secondary border-b border-border whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-bg-hover/40">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 border-b border-border/30 text-text-secondary font-mono max-w-[200px] truncate" title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-text-muted text-sm">无数据</div>
          )}
        </div>

        {/* 分页 */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
            <span>共 {data.total} 条 · 第 {page}/{totalPages} 页</span>
            <div className="flex items-center gap-1">
              <button className="btn-ghost !py-0.5 !px-2" disabled={page <= 1} onClick={() => setPage(1)}>首页</button>
              <button className="btn-ghost !py-0.5 !px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
              <button className="btn-ghost !py-0.5 !px-2" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
              <button className="btn-ghost !py-0.5 !px-2" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>末页</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
