import type { Config } from 'tailwindcss';

/**
 * 颜色 token 全部引用 CSS 变量，变量定义在 styles/index.css 的 :root 和 [data-theme] 里。
 * 用 `rgb(var(--xxx) / <alpha-value>)` 格式，这样 bg-accent/20 这类透明度语法才能工作。
 * 变量值是空格分隔的 RGB 三元组（如 "30 30 46"），不是 #hex。
 */
function rgb(name: string): string {
  return `rgb(var(${name}) / <alpha-value>)`;
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: rgb('--bg-base'),
          panel: rgb('--bg-panel'),
          hover: rgb('--bg-hover'),
          active: rgb('--bg-active'),
          input: rgb('--bg-input'),
        },
        accent: {
          DEFAULT: rgb('--accent'),
          hover: rgb('--accent-hover'),
          dim: rgb('--accent-dim'),
        },
        text: {
          primary: rgb('--text-primary'),
          secondary: rgb('--text-secondary'),
          muted: rgb('--text-muted'),
        },
        status: {
          running: rgb('--status-running'),
          stopped: rgb('--status-stopped'),
          crashed: rgb('--status-crashed'),
          warning: rgb('--status-warning'),
        },
        border: {
          DEFAULT: rgb('--border'),
          strong: rgb('--border-strong'),
        },
      },
      borderRadius: {
        DEFAULT: '4px',
      },
      fontFamily: {
        sans: ['var(--font-sans, Inter)', 'Microsoft YaHei', '微软雅黑', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono, Cascadia Code)', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
