import { useMemo, useRef, useLayoutEffect } from 'react';

/**
 * conf 高亮文本编辑器。
 *
 * 原理（经典 overlay 技巧，零依赖）：
 *   - 底层 <pre>：渲染带高亮 HTML，用户看不见光标但能看见颜色
 *   - 上层 <textarea>：文字 color: transparent，caret-color 保持可见，
 *     选中背景仍可见。两者同字体/字号/行距/padding，逐字符对齐。
 *   - 滚动/选区：textarea 的 onScroll 把 pre 的 scrollTop/Left 同步过去。
 *
 * conf 语法极简，自己写 tokenizer 就够：
 *   - 行注释  // ...                 → 灰色斜体
 *   - 配置项  key: value              → key 紫色加粗，value 白色（数值偏蓝绿）
 *   - 分隔线  //===== 或 //-----       → 暗色
 *   - 数值（含 yes/no/on/off）        → 蓝/绿
 *   - 字符串 "..."                    → 绿
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
}

/** 转义 HTML 特殊字符 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 把一行文本高亮成 HTML。
 * 用 <span class="ce-xxx"> 包裹各部分，样式见 index.css。
 */
function highlightLine(line: string): string {
  // 空行
  if (line.length === 0) return '';

  // 整行注释
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//')) {
    // 分隔线（==== ----）压暗
    if (/^\/\/\s*[=\-]{4,}/.test(trimmed)) {
      return `<span class="ce-sep">${esc(line)}</span>`;
    }
    return `<span class="ce-comment">${esc(line)}</span>`;
  }

  // 配置项：key: value（key 以字母/下划线开头，可含 . _）
  const m = line.match(/^(\s*)([A-Za-z_][\w.]*)\s*:\s*(.*)$/);
  if (m) {
    const [, indent, key, rest] = m;
    return `${esc(indent)}<span class="ce-key">${esc(key)}</span><span class="ce-colon">:</span>${highlightValue(rest)}`;
  }

  // import: 指令
  if (/^\s*import:\s/.test(line)) {
    return `<span class="ce-import">${esc(line)}</span>`;
  }

  // 其它（纯文本/说明等）
  return esc(line);
}

/** 高亮 value 部分：识别数值、布尔、字符串，剩余按普通文本 */
function highlightValue(v: string): string {
  if (v.length === 0) return '';

  // 字符串 "..." 或 '...'
  const sm = v.match(/^(\s*)(["'][^"']*["'])(.*)$/);
  if (sm) {
    const [, sp, str, rest] = sm;
    return `${esc(sp)}<span class="ce-string">${esc(str)}</span>${highlightValue(rest.trimStart())}`;
  }

  // 纯数值（含负数、十六进制 0x、小数）
  const nm = v.match(/^(\s*)(-?0x[0-9a-fA-F]+|-?\d+(?:\.\d+)?)(.*)$/);
  if (nm) {
    const [, sp, num, rest] = nm;
    return `${esc(sp)}<span class="ce-number">${esc(num)}</span>${highlightValue(rest.trimStart())}`;
  }

  // 布尔字面量
  const bm = v.match(/^(\s*)(yes|no|on|off|true|false)(\b.*)$/i);
  if (bm) {
    const [, sp, bool, rest] = bm;
    return `${esc(sp)}<span class="ce-bool">${esc(bool)}</span>${highlightValue(rest.trimStart())}`;
  }

  // 普通文本值（到行尾；但行内若还有注释 // 也要分开）
  const cmIdx = findInlineComment(v);
  if (cmIdx >= 0) {
    const valPart = v.slice(0, cmIdx);
    const cmtPart = v.slice(cmIdx);
    return `${esc(valPart)}<span class="ce-comment">${esc(cmtPart)}</span>`;
  }
  return esc(v);
}

/** 找行内注释 // 的位置（避开字符串内的 //） */
function findInlineComment(s: string): number {
  let inStr: string | null = null;
  for (let i = 0; i < s.length - 1; i++) {
    const c = s[i];
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === '/' && s[i + 1] === '/') return i;
  }
  return -1;
}

export function CodeEditor({ value, onChange, onSave, placeholder, className }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // 高亮 HTML：每行单独处理，用 \n 连接，末尾留一个空格让空行高度对齐
  const highlighted = useMemo(() => {
    const lines = value.split('\n');
    return lines.map(highlightLine).join('\n');
  }, [value]);

  /**
   * 同步滚动：pre 用 overflow:hidden 不可滚动，
   * 用 transform: translate 把高亮内容反向移动到 textarea 的滚动位置。
   * 这样只有 textarea 一层负责滚动，彻底避免两层滚动不一致。
   */
  const syncScroll = () => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    // translate 负值 = 内容随 textarea 滚动方向移动
    pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
  };

  /**
   * 延迟同步：用 rAF 在浏览器完成 textarea 的自动滚动后再同步 pre。
   * 退格/方向键等操作会让 textarea 自动把光标滚进视口，
   * 这个自动滚动发生在当前事件循环之后，直接调 syncScroll 会读到旧的 scrollTop。
   */
  const syncScrollNextFrame = () => {
    requestAnimationFrame(syncScroll);
  };

  // 内容变化后也同步一次（防止初始定位错位）
  useLayoutEffect(() => {
    syncScroll();
  }, [value]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ''}`}>
      {/* 底层高亮层。用 top-0/left-0 定位（不用 inset-0，否则高度被钉死在容器高度，
          内容超出会被裁）。高度由内容撑开，外层 overflow:hidden 裁剪可视区外。
          transform 平移跟随 textarea 滚动。 */}
      <pre
        ref={preRef}
        aria-hidden
        className="ce-layer absolute top-0 left-0 m-0 whitespace-pre pointer-events-none"
        dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
      />
      {/* 上层透明 textarea。wrap 透传 off，让长行水平滚动而非折行 */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // 内容变化后 textarea 可能自动滚动（如退格删到行首回退到上行），
          // 用 rAF 等 textarea 滚完再同步 pre
          syncScrollNextFrame();
        }}
        onScroll={syncScroll}
        // 退格/方向键/Home/End 等不改内容但会让 textarea 自动滚动光标到视口，
        // keyup 后同步一次 pre
        onKeyUp={syncScrollNextFrame}
        // 鼠标点击移动光标也可能触发自动滚动
        onClick={syncScrollNextFrame}
        spellCheck={false}
        {...{ wrap: 'off' }}
        placeholder={placeholder}
        className="ce-input absolute inset-0 w-full h-full resize-none outline-none overflow-auto whitespace-pre"
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
              syncScrollNextFrame();
            });
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            onSave?.();
          }
          // 退格/删除/方向键等会在 keydown 后触发 textarea 自动滚动，
          // 等 1 帧让浏览器滚完再同步
          syncScrollNextFrame();
        }}
      />
    </div>
  );
}
