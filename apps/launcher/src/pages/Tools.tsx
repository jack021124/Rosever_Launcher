import { useEffect, useState } from 'react';
import { PageWrapper } from './PageWrapper';
import { Icon } from '@/components/Icon';

interface ToolInfo {
  exe: string;
  name: string;
  description: string;
  defaultArgs: string[];
  available: boolean;
}

/** 工具执行页：列出服务端自带工具，运行并显示输出 */
export function DataTools() {
  return <ToolPage title="数据工具" subtitle="csv2yaml / yaml2sql / yamlupgrade 数据格式转换" filter="data" />;
}

export function MapTools() {
  return <ToolPage title="地图工具" subtitle="mapcache 重建 / navigenerator 导航生成" filter="map" />;
}

const DATA_TOOLS = ['csv2yaml.exe', 'yaml2sql.exe', 'yamlupgrade.exe'];
const MAP_TOOLS = ['mapcache.exe', 'navigenerator.exe'];

function ToolPage({ title, subtitle, filter }: { title: string; subtitle: string; filter: 'data' | 'map' }) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [activeExe, setActiveExe] = useState<string>('');
  const [args, setArgs] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{ text: string; ok: boolean; exitCode: number | null; error?: string } | null>(null);

  useEffect(() => {
    window.rosever.listTools().then((all) => {
      const want = filter === 'data' ? DATA_TOOLS : MAP_TOOLS;
      const filtered = all.filter((t) => want.includes(t.exe));
      setTools(filtered);
      if (filtered[0]) {
        setActiveExe(filtered[0].exe);
        setArgs(filtered[0].defaultArgs.join(' '));
      }
    });
  }, [filter]);

  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    const argArr = args.trim().split(/\s+/).filter(Boolean);
    const res = await window.rosever.runTool(activeExe, argArr);
    setRunning(false);
    setOutput({ text: res.output, ok: res.ok, exitCode: res.exitCode, error: res.error });
  };

  const active = tools.find((t) => t.exe === activeExe);

  return (
    <PageWrapper title={title} subtitle={subtitle}>
      <div className="flex gap-4 h-full">
        {/* 左：工具列表 */}
        <div className="w-52 shrink-0">
          {tools.length === 0 ? (
            <div className="text-xs text-text-muted p-2">未检测到可用工具</div>
          ) : (
            tools.map((t) => (
              <button
                key={t.exe}
                onClick={() => {
                  setActiveExe(t.exe);
                  setArgs(t.defaultArgs.join(' '));
                  setOutput(null);
                }}
                className={`w-full text-left px-3 py-2 rounded mb-1 transition-colors ${
                  activeExe === t.exe ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-bg-hover'
                }`}
              >
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {t.name}
                  {!t.available && <span className="text-[10px] text-status-crashed">缺失</span>}
                </div>
                <div className="text-[11px] text-text-muted truncate">{t.exe}</div>
              </button>
            ))
          )}
        </div>

        {/* 右：执行区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {active ? (
            <>
              <div className="card p-4 mb-3">
                <div className="text-sm font-semibold mb-1">{active.name}</div>
                <div className="text-xs text-text-secondary mb-3">{active.description}</div>
                <div className="flex items-center gap-2 mb-3">
                  <code className="text-[11px] text-text-muted bg-bg-input px-2 py-1 rounded">{active.exe}</code>
                </div>
                <label className="block mb-3">
                  <span className="text-[11px] text-text-muted block mb-1">参数（空格分隔）</span>
                  <input
                    className="input w-full font-mono text-xs"
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    placeholder="例如：db/import/item_db.yml"
                  />
                </label>
                <button
                  className="btn-primary"
                  onClick={handleRun}
                  disabled={running || !active.available}
                >
                  <Icon.Play size={14} />
                  {running ? '运行中…' : '运行'}
                </button>
                {!active.available && (
                  <span className="text-xs text-status-crashed ml-2">该 exe 在服务端目录不存在</span>
                )}
              </div>

              {/* 输出 */}
              {output && (
                <div className="card flex-1 overflow-hidden flex flex-col min-h-0">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                    <span className="text-xs text-text-muted">输出</span>
                    <span className={`text-xs ${output.ok ? 'text-status-running' : 'text-status-crashed'}`}>
                      {output.ok ? '✓ 成功' : `✗ 失败${output.exitCode !== null ? ` (退出码 ${output.exitCode})` : ''}`}
                    </span>
                  </div>
                  <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-text-secondary whitespace-pre-wrap selectable">
                    {output.error && !output.text ? output.error : output.text || '(无输出)'}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              选择左侧工具开始
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
