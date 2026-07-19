import { useEffect, useState, useCallback, useMemo } from 'react';
import { PageWrapper } from './PageWrapper';
import { npcScriptLabel, NPC_SCRIPT_LABELS } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';
import { CodeEditor } from '@/components/CodeEditor';
import { CollapsibleSection } from '@/components/CollapsibleSection';

/**
 * 服务端自带的标准脚本清单文件名（去 .conf）。
 * 这几个文件名写死：检测到这些文件按目录归类到「根目录/复兴后/复兴前」。
 * 任何文件名不在这个列表里的，一律归到「自定义」栏，无论它在哪个目录。
 */
const STANDARD_BASENAMES = new Set(Object.keys(NPC_SCRIPT_LABELS));

/**
 * 脚本配置页 —— 专门编辑 npc/ 目录下的 *.conf 文件。
 *
 * 这些 conf 是「脚本清单」文件（scripts_*.conf），用户在里面用
 *   npc: npc/xxx/yyy.txt        （启用脚本）
 *   //npc: npc/xxx/yyy.txt      （禁用脚本）
 * 控制哪些 NPC 脚本被加载。
 *
 * 与「配置」页的区别：
 *   - 文件列表是动态扫描 npc/ 目录得到的，而非硬编码
 *   - 文件按所在目录分组，用中文目录名（根目录/复兴后/复兴前/自定义）
 *   - 文件显示中文标签（scripts_warps → 「传送点」），不是原始文件名
 *   - 支持新建 conf（用户自建清单归入「自定义」栏）
 *   - 不经过 conf/ 前缀，路径直接相对 serverRoot
 */

/** 把 npc 子目录路径翻译成中文分组名（仅用于标准文件） */
const DIR_LABELS: Record<string, string> = {
  'npc/': '根目录',
  'npc/re/': '复兴后',
  'npc/pre-re/': '复兴前',
};

/** 用户新建 conf 的存放目录（相对 serverRoot）。新建的文件落到这里 */
const CUSTOM_DIR = 'npc/custom_scripts';

/** 自定义分组的显示名 */
const CUSTOM_LABEL = '自定义';

export function NpcScripts() {
  const [files, setFiles] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string>('');
  const [text, setText] = useState('');
  /** 上次保存/加载时的文本，用于判断是否有未保存改动 */
  const [savedText, setSavedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  /** 新建 conf 弹窗状态 */
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const dirty = text !== savedText;

  /** 新建 conf：文件名补全 .conf 后缀，存到 npc/custom_scripts/ 下 */
  const handleCreate = async () => {
    let name = newName.trim();
    if (!name) {
      setMsg({ type: 'err', text: '请输入文件名' });
      return;
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
      setMsg({ type: 'err', text: '文件名只能含字母、数字、下划线、横线' });
      return;
    }
    if (!name.endsWith('.conf')) name += '.conf';
    const relPath = `${CUSTOM_DIR}/${name}`;
    const res = await window.rosever.createConf(relPath);
    if (!res.ok) {
      setMsg({ type: 'err', text: `新建失败: ${res.error}` });
      return;
    }
    setCreating(false);
    setNewName('');
    setMsg({ type: 'ok', text: `已新建: ${relPath}` });
    await scanFiles();
    setActiveFile(relPath);
  };

  // 扫描 npc/ 下所有 .conf
  const scanFiles = useCallback(async () => {
    const res = await window.rosever.listConfTree('npc');
    if ('error' in res) {
      setScanError(res.error);
      setFiles([]);
      return;
    }
    setScanError(null);
    setFiles(res.files);
    if (!activeFile && res.files.length > 0) {
      setActiveFile(res.files[0]);
    } else if (activeFile && !res.files.includes(activeFile)) {
      // 当前选中的文件不在列表里（可能被改名/删除），切到第一个
      setActiveFile(res.files[0] ?? '');
    }
  }, [activeFile]);

  useEffect(() => {
    scanFiles();
  }, [scanFiles]);

  // 读取文件内容
  const loadFile = useCallback(async (relPath: string) => {
    if (!relPath) {
      setText('');
      setSavedText('');
      return;
    }
    setLoading(true);
    setMsg(null);
    const res = await window.rosever.readConf(relPath);
    setLoading(false);
    if ('error' in res) {
      setMsg({ type: 'err', text: `读取失败: ${res.error}` });
      setText('');
      setSavedText('');
      return;
    }
    // 归一化换行：conf 文件是 CRLF，textarea/pre 统一用 LF 才能对齐光标
    const normalized = res.originalText.replace(/\r\n/g, '\n');
    setText(normalized);
    setSavedText(normalized);
  }, []);

  useEffect(() => {
    if (activeFile) loadFile(activeFile);
  }, [activeFile, loadFile]);

  const handleSave = async () => {
    if (!dirty || !activeFile) return;
    setSaving(true);
    setMsg(null);
    const res = await window.rosever.saveConfText(activeFile, text);
    setSaving(false);
    if (res.ok) {
      setSavedText(text);
      setMsg({ type: 'ok', text: `已保存${res.backup ? `，备份: ${res.backup}` : ''}` });
    } else {
      setMsg({ type: 'err', text: `保存失败: ${res.error}` });
    }
  };

  const handleReset = () => {
    setText(savedText);
    setMsg(null);
  };

  const handleRefresh = () => {
    scanFiles();
  };

  // 分组规则：
  //   - 文件名在 STANDARD_BASENAMES 里 → 标准文件，按所在目录归到
  //     「根目录 / 复兴后 / 复兴前」
  //   - 其余文件（包括用户自建的）一律归到「自定义」栏，无论在哪个目录
  // 「自定义」栏始终显示（即使为空，也显示「新建 conf」入口）
  const grouped = useMemo(() => {
    const groups: Record<string, string[]> = {};
    // 预置「自定义」分组，保证它始终存在
    const CUSTOM_KEY = '__custom__';
    groups[CUSTOM_KEY] = [];
    for (const f of files) {
      const parts = f.split('/');
      const fileName = parts[parts.length - 1];
      const base = fileName.replace(/\.conf$/i, '');
      if (STANDARD_BASENAMES.has(base)) {
        // 标准文件：按目录归类（取前两段作目录键）
        const dirKey = parts.length >= 3 ? `${parts[0]}/${parts[1]}/` : `${parts[0]}/`;
        (groups[dirKey] ??= []).push(f);
      } else {
        // 非标准文件 → 自定义
        groups[CUSTOM_KEY].push(f);
      }
    }
    // 排序：根目录 → 复兴后 → 复兴前 → 自定义 → 其他
    const ORDER = ['npc/', 'npc/re/', 'npc/pre-re/', CUSTOM_KEY];
    const orderOf = (k: string) => {
      const i = ORDER.indexOf(k);
      return i === -1 ? ORDER.length + k.localeCompare('zzz') : i;
    };
    return Object.entries(groups)
      .sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
      .map(([dir, list]) => ({
        dir,
        label: dir === CUSTOM_KEY ? CUSTOM_LABEL : (DIR_LABELS[dir] ?? dir),
        isCustom: dir === CUSTOM_KEY,
        list,
      }));
  }, [files]);

  const lineCount = text ? text.split('\n').length : 0;

  return (
    <PageWrapper
      title="脚本配置"
      subtitle="编辑 npc/ 下的脚本清单文件（scripts_*.conf）"
      actions={
        <>
          <button className="btn-ghost" onClick={() => { setCreating(true); setMsg(null); }} title="在「自定义」栏新建 conf">
            <Icon.Plus size={14} />
            新建
          </button>
          <button className="btn-ghost" onClick={handleRefresh} title="重新扫描 npc/ 目录">
            <Icon.Refresh size={14} />
            刷新
          </button>
          <button className="btn-ghost" onClick={handleReset} disabled={!dirty}>
            <Icon.Refresh size={14} />
            重置
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={!dirty || saving || !activeFile}>
            <Icon.Save size={14} />
            保存{dirty ? ' *' : ''}
          </button>
        </>
      }
    >
      <div className="flex gap-4 h-full min-h-0">
        {/* 左：文件导航（按目录分组） */}
        {/* 新建 conf 弹层 */}
        {creating && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setCreating(false)}
          >
            <div
              className="card p-5 w-80 shadow-lg rounded-xl animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-1">新建 conf 文件</h3>
              <p className="text-xs text-text-secondary mb-3">
                将在 <code className="text-text-primary font-mono">{CUSTOM_DIR}/</code> 下创建。
                不需要输入 .conf 后缀，会自动补全。
              </p>
              <input
                className="input w-full text-sm font-mono"
                placeholder="例如：my_scripts"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button className="btn-ghost !py-1 !text-xs" onClick={() => setCreating(false)}>
                  取消
                </button>
                <button className="btn-primary !py-1 !text-xs" onClick={handleCreate}>
                  <Icon.Plus size={13} />
                  创建
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 左：文件导航（按目录分组） */}
        <div className="w-52 shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">
          {scanError && (
            <div className="px-2 py-2 rounded text-xs bg-status-crashed/10 text-status-crashed border border-status-crashed/30">
              扫描失败: {scanError}
            </div>
          )}
          {files.length === 0 && !scanError && (
            <div className="text-xs text-text-muted px-2 py-4 text-center">
              npc/ 下未找到 .conf 文件
            </div>
          )}
          {grouped.map(({ dir, label, list, isCustom }) => (
            <CollapsibleSection key={dir} label={label} title={isCustom ? '用户自建的 conf' : dir}>
              {list.length === 0 ? (
                isCustom ? (
                  <button
                    onClick={() => { setCreating(true); setMsg(null); }}
                    className="w-full text-left px-2 py-1.5 rounded text-sm text-text-muted hover:bg-bg-hover hover:text-accent transition-colors flex items-center gap-1.5 border border-dashed border-border"
                  >
                    <Icon.Plus size={13} />
                    新建 conf
                  </button>
                ) : null
              ) : (
                <>
                  {list.map((f) => {
                    const fileName = f.split('/').pop() ?? f;
                    const display = npcScriptLabel(fileName);
                    return (
                      <button
                        key={f}
                        onClick={() => setActiveFile(f)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                          activeFile === f
                            ? 'bg-accent/20 text-accent'
                            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                        }`}
                        title={f}
                      >
                        {display}
                      </button>
                    );
                  })}
                  {/* 自定义栏末尾追加「新建」入口 */}
                  {isCustom && (
                    <button
                      onClick={() => { setCreating(true); setMsg(null); }}
                      className="w-full text-left px-2 py-1.5 mt-1 rounded text-sm text-text-muted hover:bg-bg-hover hover:text-accent transition-colors flex items-center gap-1.5 border border-dashed border-border"
                    >
                      <Icon.Plus size={13} />
                      新建 conf
                    </button>
                  )}
                </>
              )}
            </CollapsibleSection>
          ))}
        </div>

        {/* 右：纯文本编辑区 */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* 工具栏 */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[11px] text-text-muted font-mono truncate">
              {activeFile || '(未选择文件)'}
              {lineCount > 0 && ` · ${lineCount} 行`}
            </div>
            {dirty && (
              <span className="text-[11px] text-accent flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                未保存
              </span>
            )}
          </div>

          {/* 消息条 */}
          {msg && (
            <div
              className={`mb-2 px-3 py-2 rounded text-xs ${
                msg.type === 'ok'
                  ? 'bg-status-running/10 text-status-running border border-status-running/30'
                  : 'bg-status-crashed/10 text-status-crashed border border-status-crashed/30'
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* 高亮文本编辑器 */}
          {!activeFile ? (
            <div className="card flex-1 p-8 text-center text-text-muted text-sm">
              请在左侧选择一个 .conf 文件
            </div>
          ) : loading ? (
            <div className="card flex-1 p-8 text-center text-text-muted text-sm">加载中…</div>
          ) : (
            <div className="card flex-1 overflow-hidden p-0 min-h-0">
              <CodeEditor
                value={text}
                onChange={setText}
                onSave={handleSave}
                placeholder="(空文件)"
              />
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
