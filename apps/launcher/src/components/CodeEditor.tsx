import { useEffect, useRef } from 'react';
import { EditorState, type StateCommand } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * conf 高亮文本编辑器（CodeMirror 6）。
 *
 * 历史：最早用 overlay 技巧（透明 textarea + 彩色 div 高亮层），但 Electron 31
 * 里 textarea 和 div 的文字渲染存在亚像素级偏差，导致光标位置和可见文字
 * 错位、退格删错字符，多轮排查无法消除，一度退化为纯 textarea 放弃高亮。
 *
 * 现改用 CodeMirror 6：它自己渲染文字、光标和选区（contenteditable），
 * 不存在两层渲染对齐问题，高亮与光标正确性可以兼得。
 *
 * conf 语法极简，用 StreamLanguage 手写 tokenizer：
 *   - 行注释  // ...                 → 灰色斜体（//===== 分隔线压更暗）
 *   - 配置项  key: value              → key 紫色加粗，冒号灰，value 按类型上色
 *   - import: 指令                    → 橙色
 *   - 数值 / yes/no/on/off / 字符串   → 蓝 / 绿 / 绿
 * 颜色全部走 --ce-* CSS 变量（见 index.css），随主题深浅自动切换。
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
}

/* ---------------------------------- conf 语法 ---------------------------------- */

interface ConfState {
  /** 当前行解析阶段：key 后等冒号 → 冒号后是 value */
  phase: 'colon' | 'value' | 'plain';
}

const confLanguage = StreamLanguage.define<ConfState>({
  name: 'conf',
  startState: () => ({ phase: 'plain' }),
  token(stream, state) {
    // 行首：判断整行类型
    if (stream.sol()) {
      state.phase = 'plain';
      stream.eatSpace();
      // 整行注释 / 分隔线
      if (stream.match('//')) {
        const isSep = !!stream.match(/^\s*[=\-]{4,}/, false);
        stream.skipToEnd();
        return isSep ? 'meta' : 'lineComment';
      }
      // import: 指令（整行上色）
      if (stream.match(/^import\s*:/)) {
        stream.skipToEnd();
        return 'keyword';
      }
      // 配置项 key（后面必须跟冒号才算）
      if (stream.match(/^[A-Za-z_][\w.]*(?=\s*:)/)) {
        state.phase = 'colon';
        return 'propertyName';
      }
      stream.next();
      return null;
    }

    // key 之后：吃掉冒号
    if (state.phase === 'colon') {
      if (stream.eatSpace()) return null;
      if (stream.eat(':')) {
        state.phase = 'value';
        return 'punctuation';
      }
      state.phase = 'value';
    }

    // value 段：空白 → 行内注释 → 字符串 → 数值 → 布尔 → 普通字符
    if (stream.eatSpace()) return null;
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'lineComment';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*("|$)/)) return 'string';
    if (stream.match(/^'(?:[^'\\]|\\.)*('|$)/)) return 'string';
    if (stream.match(/^-?0x[0-9a-fA-F]+/)) return 'number';
    if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
    if (stream.match(/^(yes|no|on|off|true|false)\b/i)) return 'atom';
    stream.next();
    return null;
  },
  tokenTable: {
    lineComment: tags.lineComment,
    meta: tags.meta,
    keyword: tags.keyword,
    propertyName: tags.propertyName,
    punctuation: tags.punctuation,
    number: tags.number,
    atom: tags.atom,
    string: tags.string,
  },
});

/* ---------------------------------- 高亮配色 ---------------------------------- */
/* 颜色引用 --ce-* CSS 变量，主题切换时无需重建编辑器 */

const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'rgb(var(--ce-key))', fontWeight: '600' },
  { tag: tags.punctuation, color: 'rgb(var(--ce-colon))' },
  { tag: tags.number, color: 'rgb(var(--ce-number))' },
  { tag: tags.atom, color: 'rgb(var(--ce-bool))' },
  { tag: tags.string, color: 'rgb(var(--ce-string))' },
  { tag: tags.lineComment, color: 'rgb(var(--ce-comment))', fontStyle: 'italic' },
  { tag: tags.meta, color: 'rgb(var(--ce-sep))' },
  { tag: tags.keyword, color: 'rgb(var(--ce-import))' },
]);

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'rgb(var(--ce-text))',
    fontSize: 'var(--ce-font-size, 12px)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "var(--font-mono, 'Cascadia Code'), 'Consolas', monospace",
    lineHeight: 'var(--ce-line-height, 1.6)',
  },
  '.cm-content': {
    padding: '12px 0',
    caretColor: 'rgb(var(--accent))',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor': {
    borderLeftColor: 'rgb(var(--accent))',
  },
  '& .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--accent) / 0.3)',
  },
  '.cm-placeholder': {
    color: 'rgb(var(--text-muted))',
  },
});

/** Tab 键插入 4 个空格（conf 不用制表符） */
const insertFourSpaces: StateCommand = ({ state, dispatch }) => {
  dispatch(state.update(state.replaceSelection('    '), { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/* ---------------------------------- 组件 ---------------------------------- */

export function CodeEditor({ value, onChange, onSave, placeholder, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 回调走 ref，保证编辑器只建一次、始终调用最新的 onChange/onSave
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          confLanguage,
          syntaxHighlighting(highlightStyle),
          editorTheme,
          cmPlaceholder(placeholder ?? ''),
          EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
          keymap.of([
            { key: 'Mod-s', run: () => { onSaveRef.current?.(); return true; } },
            { key: 'Tab', run: insertFourSpaces },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 编辑器只建一次；初始文档用挂载时的 value，之后靠下方同步 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部 value 变化（切文件 / 切模式重载）→ 整文同步进编辑器。
  // 用户自己打字时 value 与文档一致，不会触发 dispatch，光标不受影响。
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className={`ce-wrap h-full w-full overflow-hidden ${className ?? ''}`} />;
}
