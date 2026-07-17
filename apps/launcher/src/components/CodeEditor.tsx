import { useRef } from 'react';

/**
 * conf 文本编辑器。
 *
 * 之前用 overlay 技巧（透明 textarea + 彩色 div 高亮层），但 Electron 31
 * 里 textarea 和 div 的文字渲染存在亚像素级偏差，导致光标位置和可见文字
 * 错位、退格删错字符。经多轮排查（padding/font-weight/标签类型/inset 定位）
 * 均无法消除该偏差，最终放弃高亮，改用纯 textarea 直接显示文字。
 *
 * 退格/光标行为 100% 正确，conf 纯文本用等宽字体足够清晰。
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
}

export function CodeEditor({ value, onChange, onSave, placeholder, className }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className={`ce-wrap relative h-full w-full overflow-hidden ${className ?? ''}`}>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        {...{ wrap: 'off' }}
        placeholder={placeholder}
        className="ce-input absolute inset-0 resize-none outline-none overflow-auto whitespace-pre"
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.currentTarget;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const next = value.slice(0, start) + '    ' + value.slice(end);
            onChange(next);
            requestAnimationFrame(() => {
              ta.selectionStart = ta.selectionEnd = start + 4;
            });
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            onSave?.();
          }
        }}
      />
    </div>
  );
}
