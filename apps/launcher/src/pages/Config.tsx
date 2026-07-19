import { useEffect, useState, useCallback } from 'react';
import { PageWrapper } from './PageWrapper';
import { CONF_SECTIONS, toImportPath } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';
import { CodeEditor } from '@/components/CodeEditor';
import { CollapsibleSection } from '@/components/CollapsibleSection';

type ConfMode = 'direct' | 'safe';
const MODE_KEY = 'rosever.confMode';

/**
 * 配置页 —— 纯文本编辑模式。
 *
 * 两种保存模式：
 *   - direct（直接修改）：覆盖原文件，备份到 conf/.backup/
 *   - safe（安全覆盖）：只把改动写入 conf/import/ 覆盖文件，原文件不动
 *
 * 安全覆盖模式下，读取时合并「原文件 + import 覆盖」显示最终生效值。
 * 模式开关记在 localStorage，全局生效。
 */
export function Config() {
  const [activeFile, setActiveFile] = useState(CONF_SECTIONS[0].files[0].path);
  const [text, setText] = useState('');
  /** 上次保存/加载时的文本，用于判断是否有未保存改动 */
  const [savedText, setSavedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [mode, setMode] = useState<ConfMode>(() => {
    return (localStorage.getItem(MODE_KEY) as ConfMode) || 'direct';
  });

  const dirty = text !== savedText;

  /** 当前文件是否支持安全覆盖（有 import 映射目标） */
  const canSafe = toImportPath(`conf/${activeFile}`) !== null;
  /** 实际生效的模式：如果当前文件不支持安全覆盖，强制 direct */
  const effectiveMode: ConfMode = mode === 'safe' && !canSafe ? 'direct' : mode;

  const loadFile = useCallback(async (relPath: string, useMode: ConfMode) => {
    setLoading(true);
    setMsg(null);
    const fullPath = `conf/${relPath}`;

    if (useMode === 'safe') {
      const importPath = toImportPath(fullPath);
      if (importPath) {
        const res = await window.rosever.readConfMerged(fullPath);
        setLoading(false);
        if ('error' in res) {
          setMsg({ type: 'err', text: `读取失败: ${res.error}` });
          setText('');
          setSavedText('');
          return;
        }
        const normalized = res.mergedText.replace(/\r\n/g, '\n');
        setText(normalized);
        setSavedText(normalized);
        return;
      }
    }

    // 直接修改模式（或不支持安全覆盖的文件回退）
    const res = await window.rosever.readConf(fullPath);
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
    loadFile(activeFile, effectiveMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, mode]);

  const handleSave = async () => {
    if (!dirty) return;
    setSaving(true);
    setMsg(null);
    const fullPath = `conf/${activeFile}`;

    if (effectiveMode === 'safe') {
      const res = await window.rosever.saveConfImport(fullPath, text);
      setSaving(false);
      if (res.ok) {
        setSavedText(text);
        const importPath = toImportPath(fullPath);
        setMsg({
          type: 'ok',
          text: `已写入覆盖文件 ${importPath}，原文件未改动${res.backup ? `，备份: ${res.backup}` : ''}`,
        });
      } else {
        setMsg({ type: 'err', text: `保存失败: ${res.error}` });
      }
    } else {
      const res = await window.rosever.saveConfText(fullPath, text);
      setSaving(false);
      if (res.ok) {
        setSavedText(text);
        setMsg({ type: 'ok', text: `已保存${res.backup ? `，备份: ${res.backup}` : ''}` });
      } else {
        setMsg({ type: 'err', text: `保存失败: ${res.error}` });
      }
    }
  };

  const handleReset = () => {
    setText(savedText);
    setMsg(null);
  };

  const handleModeChange = (newMode: ConfMode) => {
    if (newMode === mode) return;
    localStorage.setItem(MODE_KEY, newMode);
    setMode(newMode);
    // 模式切换后 loadFile 会由 useEffect 重新触发
  };

  const lineCount = text ? text.split('\n').length : 0;

  return (
    <PageWrapper
      title="配置"
      subtitle="编辑服务端配置文件"
      actions={
        <>
          {/* 模式开关 */}
          <div className="seg text-[11px]" title={canSafe ? '' : '该文件不支持安全覆盖'}>
            <button
              onClick={() => handleModeChange('direct')}
              className={effectiveMode === 'direct' ? 'seg-item-active' : 'seg-item'}
            >
              直接修改
            </button>
            <button
              onClick={() => canSafe && handleModeChange('safe')}
              disabled={!canSafe}
              className={`seg-item ${effectiveMode === 'safe' ? 'seg-item-active' : ''} ${
                !canSafe ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              安全覆盖
            </button>
          </div>
          <button className="btn-ghost" onClick={handleReset} disabled={!dirty}>
            <Icon.Refresh size={14} />
            重置
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={!dirty || saving}>
            <Icon.Save size={14} />
            保存{dirty ? ' *' : ''}
          </button>
        </>
      }
    >
      <div className="flex gap-4 h-full min-h-0">
        {/* 左：分类 + 文件导航 */}
        <div className="w-44 shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">
          {CONF_SECTIONS.map((sec) => (
            <CollapsibleSection key={sec.id} label={sec.label}>
              {sec.files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setActiveFile(f.path)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                    activeFile === f.path
                      ? 'bg-accent/20 text-accent'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </CollapsibleSection>
          ))}
        </div>

        {/* 右：纯文本编辑区 */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* 工具栏 */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[11px] text-text-muted font-mono">
              conf/{activeFile}
              {lineCount > 0 && ` · ${lineCount} 行`}
            </div>
            <div className="flex items-center gap-2">
              {/* 模式提示 */}
              <span className={`text-[10px] ${effectiveMode === 'safe' ? 'text-status-running' : 'text-text-muted'}`}>
                {effectiveMode === 'safe' ? '🛡 改动写入覆盖文件' : '改动写入原文件'}
              </span>
              {dirty && (
                <span className="text-[11px] text-accent flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  未保存
                </span>
              )}
            </div>
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
          {loading ? (
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
