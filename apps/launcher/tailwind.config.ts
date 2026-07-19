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
        DEFAULT: '6px',
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        // 阴影基色走 --shadow 变量，深/浅主题自动区分
        sm: '0 1px 2px rgb(var(--shadow) / 0.10)',
        DEFAULT: '0 2px 8px rgb(var(--shadow) / 0.14)',
        md: '0 4px 16px rgb(var(--shadow) / 0.18)',
        lg: '0 8px 32px rgb(var(--shadow) / 0.24)',
      },
      fontFamily: {
        sans: ['var(--font-sans, Inter)', 'Microsoft YaHei', '微软雅黑', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono, Cascadia Code)', 'Consolas', 'monospace'],
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.15)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
