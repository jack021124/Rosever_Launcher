import { useState, useEffect } from 'react';
import { PageWrapper } from './PageWrapper';
import { Icon } from '@/components/Icon';
import { useAppStore } from '@/store/appStore';
import {
  THEMES,
  FONT_OPTIONS_SANS,
  FONT_OPTIONS_MONO,
  DEFAULT_FONT_SIZE_BASE,
  DEFAULT_CE_FONT_SIZE,
  DEFAULT_CE_LINE_HEIGHT,
} from '@/themes';

/** 关于信息：动态读取版本号（app.getVersion） */
function AboutInfo() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    window.rosever.getVersion().then((v) => setVersion(v));
  }, []);
  return (
    <div className="text-xs text-text-secondary space-y-1.5">
      <div>渡鸦 {version && <span className="text-text-muted">v{version}</span>}</div>
      <div className="text-text-muted">RO (BetterRA / rAthena) 服务端启动器与远程管理桌面端</div>
    </div>
  );
}

/* —— RGB 三元组字符串与 hex 互转（ce-* 变量存 "r g b"，color input 用 #hex） —— */
function rgbStrToHex(s: string): string {
  const m = s.match(/(\d+)\s+(\d+)\s+(\d+)/);
  if (!m) return '#ffffff';
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}
function hexToRgbStr(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '255 255 255';
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(' ');
}

/** 从当前 DOM 读取某个 CSS 变量值（getComputedStyle 会解析样式表默认 + inline 自定义） */
function readVar(key: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
}

/** 高亮 token 元数据：key → 中文名（用于颜色选择器标签） */
const CE_TOKENS: { key: string; label: string }[] = [
  { key: '--ce-text', label: '普通文字' },
  { key: '--ce-key', label: '键名' },
  { key: '--ce-colon', label: '冒号' },
  { key: '--ce-number', label: '数值' },
  { key: '--ce-bool', label: '布尔值' },
  { key: '--ce-string', label: '字符串' },
  { key: '--ce-comment', label: '注释' },
  { key: '--ce-sep', label: '分隔线' },
  { key: '--ce-import', label: 'import 指令' },
];

/**
 * 设置页 —— 主题 + 字体 + 代码高亮颜色自定义。
 * 自定义作为主题之上的"叠加层"：选主题后仍可微调，重置按钮恢复主题默认。
 */
export function Settings() {
  const themeId = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const custom = useAppStore((s) => s.custom);
  const setCustom = useAppStore((s) => s.setCustom);
  const resetCustom = useAppStore((s) => s.resetCustom);

  return (
    <PageWrapper title="设置" subtitle="主题外观、字体与代码高亮自定义">
      {/* 主题选择 */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Icon.Settings size={15} className="text-accent" />
          主题外观
        </h3>
        <p className="text-xs text-text-secondary mb-3">
          选择配色方案，点击立即生效。字体与高亮的自定义会在所选主题之上叠加。
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {THEMES.map((t) => {
            const active = t.id === themeId;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`rounded-lg border p-3 text-left transition-all duration-200 ease-out-soft ${
                  active
                    ? 'border-accent ring-1 ring-accent/40 bg-accent/[0.04] shadow-sm'
                    : 'border-border hover:border-border-strong hover:shadow-md hover:-translate-y-0.5 bg-bg-panel/50'
                }`}
              >
                <div
                  className="rounded-md mb-2.5 overflow-hidden border"
                  style={{ background: t.swatch.bg, borderColor: 'rgba(128,128,128,0.2)' }}
                >
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <div className="flex flex-col gap-1 w-6">
                      <div className="h-1.5 rounded-full" style={{ background: t.swatch.accent, opacity: 0.9 }} />
                      <div className="h-1.5 rounded-full" style={{ background: t.swatch.accent, opacity: 0.4 }} />
                      <div className="h-1.5 rounded-full" style={{ background: t.swatch.accent, opacity: 0.4 }} />
                    </div>
                    <div className="flex-1 flex flex-col gap-1 py-0.5">
                      <div className="h-1.5 rounded-full w-3/4" style={{ background: t.mode === 'dark' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)' }} />
                      <div className="h-1.5 rounded-full w-1/2" style={{ background: t.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${active ? 'text-accent font-medium' : 'text-text-primary'}`}>{t.name}</span>
                  {active && <Icon.Check size={15} className="text-accent" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 字体设置 */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Icon.Log size={15} className="text-accent" />
          字体
        </h3>
        <p className="text-xs text-text-secondary mb-3">界面与代码编辑器的字体族、字号。</p>
        <div className="card p-4 space-y-4">
          {/* 界面字体 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-text-secondary w-24 shrink-0">界面字体</label>
            <select
              className="input flex-1 text-xs"
              value={FONT_OPTIONS_SANS.find((f) => f.value === custom.fontSans)?.id ?? 'default'}
              onChange={(e) => {
                const opt = FONT_OPTIONS_SANS.find((f) => f.id === e.target.value);
                setCustom({ fontSans: opt ? opt.value : null });
              }}
            >
              <option value="default">主题默认</option>
              {FONT_OPTIONS_SANS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <span className="text-xs text-text-muted shrink-0" style={{ fontFamily: custom.fontSans ?? 'inherit' }}>
              预览文字 Rosever 123
            </span>
          </div>

          {/* 代码字体 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-text-secondary w-24 shrink-0">代码字体</label>
            <select
              className="input flex-1 text-xs"
              value={FONT_OPTIONS_MONO.find((f) => f.value === custom.fontMono)?.id ?? 'default'}
              onChange={(e) => {
                const opt = FONT_OPTIONS_MONO.find((f) => f.id === e.target.value);
                setCustom({ fontMono: opt ? opt.value : null });
              }}
            >
              <option value="default">主题默认</option>
              {FONT_OPTIONS_MONO.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <span className="text-xs text-text-muted shrink-0 font-mono" style={{ fontFamily: custom.fontMono ?? 'inherit' }}>
              key: 123
            </span>
          </div>

          {/* 界面字号 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-text-secondary w-24 shrink-0">界面字号</label>
            <input
              type="range"
              min={12}
              max={18}
              step={1}
              value={custom.fontSizeBase ?? DEFAULT_FONT_SIZE_BASE}
              onChange={(e) => setCustom({ fontSizeBase: Number(e.target.value) })}
              className="flex-1 accent-accent cursor-pointer"
            />
            <span className="text-xs text-text-secondary w-16 text-right font-mono">
              {custom.fontSizeBase ?? DEFAULT_FONT_SIZE_BASE}px
            </span>
          </div>

          {/* 代码字号 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-text-secondary w-24 shrink-0">代码字号</label>
            <input
              type="range"
              min={10}
              max={18}
              step={1}
              value={custom.ceFontSize ?? DEFAULT_CE_FONT_SIZE}
              onChange={(e) => setCustom({ ceFontSize: Number(e.target.value) })}
              className="flex-1 accent-accent cursor-pointer"
            />
            <span className="text-xs text-text-secondary w-16 text-right font-mono">
              {custom.ceFontSize ?? DEFAULT_CE_FONT_SIZE}px
            </span>
          </div>

          {/* 代码行高 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-text-secondary w-24 shrink-0">代码行高</label>
            <input
              type="range"
              min={1.2}
              max={2}
              step={0.1}
              value={custom.ceLineHeight ?? DEFAULT_CE_LINE_HEIGHT}
              onChange={(e) => setCustom({ ceLineHeight: Number(e.target.value) })}
              className="flex-1 accent-accent cursor-pointer"
            />
            <span className="text-xs text-text-secondary w-16 text-right font-mono">
              {custom.ceLineHeight ?? DEFAULT_CE_LINE_HEIGHT}
            </span>
          </div>
        </div>
      </section>

      {/* 代码高亮颜色 */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Icon.Database size={15} className="text-accent" />
          代码高亮颜色
        </h3>
        <p className="text-xs text-text-secondary mb-3">
          配置文件编辑器的语法高亮配色。修改后立即生效，重置可恢复当前主题的默认高亮。
        </p>
        <div className="card p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {CE_TOKENS.map((tok) => {
            // 优先读用户自定义，否则从 DOM 读当前生效值（样式表深/浅默认或 inline 覆盖）
            const stored = custom.highlight[tok.key];
            const current = stored ?? readVar(tok.key);
            const hex = rgbStrToHex(current);
            return (
              <div key={tok.key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => {
                    const rgb = hexToRgbStr(e.target.value);
                    setCustom({ highlight: { ...custom.highlight, [tok.key]: rgb } });
                  }}
                  className="w-7 h-7 rounded border border-border cursor-pointer shrink-0 bg-transparent"
                  title={tok.label}
                />
                <span className="text-xs text-text-secondary">{tok.label}</span>
                <span className="text-[10px] text-text-muted font-mono ml-auto">{hex}</span>
                {/* 单项重置 */}
                {stored && (
                  <button
                    onClick={() => {
                      const next = { ...custom.highlight };
                      delete next[tok.key];
                      setCustom({ highlight: next });
                    }}
                    className="text-[10px] text-text-muted hover:text-accent"
                    title="恢复主题默认"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 操作 + 关于 */}
      <div className="flex items-center justify-between mb-6">
        <button className="btn-ghost !py-1.5" onClick={resetCustom}>
          <Icon.Refresh size={14} />
          重置全部自定义
        </button>
      </div>

      <section className="card p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Icon.Help size={15} className="text-accent" />
          关于
        </h3>
        <AboutInfo />
      </section>
    </PageWrapper>
  );
}
