import { useEffect, useState, useCallback } from 'react';
import { PageWrapper } from './PageWrapper';
import { CONF_SECTIONS } from '@rosever/shared/types';
import { Icon } from '@/components/Icon';
import { CodeEditor } from '@/components/CodeEditor';
import { CollapsibleSection } from '@/components/CollapsibleSection';

/**
 * 配置页 —— 纯文本编辑模式。
 *
 * 不再解析 conf 文件成结构化项，直接像记事本一样显示原文：
 *   - 左侧：分类 + 文件导航（保留）
 *   - 右侧：一个大 textarea，显示/编辑 conf 原文
 *
 * 保存走 conf:saveText（直接写整段，备份 + 原子写入 + GBK）。
 */
export function Config() {
  const [activeFile, setActiveFile] = useState(CONF_SECTIONS[0].files[0].path);
  const [text, setText] = useState('');
  /** 上次保存/加载时的文本，用于判断是否有未保存改动 */
  const [savedText, setSavedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const dirty = text !== savedText;

  const loadFile = useCallback(async (relPath: string) => {
    setLoading(true);
    setMsg(null);
    const res = await window.rosever.readConf(`conf/${relPath}`);
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
    loadFile(activeFile);
  }, [activeFile, loadFile]);

  const handleSave = async () => {
    if (!dirty) return;
    setSaving(true);
    setMsg(null);
    const res = await window.rosever.saveConfText(`conf/${activeFile}`, text);
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

  const lineCount = text ? text.split('\n').length : 0;

  return (
    <PageWrapper
      title="配置"
      subtitle="直接编辑配置文件原文"
      actions={
        <>
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
            {dirty && (
              <span className="text-[11px] text-accent flex items-center gap-1">
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
