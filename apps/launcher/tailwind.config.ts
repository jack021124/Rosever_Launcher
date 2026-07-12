import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // 暗色紫调主题，对齐设计稿
        bg: {
          base: '#1E1E2E',     // 主背景
          panel: '#252535',    // 侧栏/卡片
          hover: '#2D2D40',    // 悬停
          active: '#33334A',   // 选中
          input: '#181828',    // 输入框
        },
        accent: {
          DEFAULT: '#8A2BE2',  // 强调紫
          hover: '#9D44E8',
          dim: '#6B1FB8',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#A0A0B8',
          muted: '#6B6B85',
        },
        status: {
          running: '#4ADE80',
          stopped: '#6B6B85',
          crashed: '#EF4444',
          warning: '#FBBF24',
        },
        border: {
          DEFAULT: '#363650',
          strong: '#4A4A6A',
        },
      },
      borderRadius: {
        DEFAULT: '4px',
      },
      fontFamily: {
        sans: ['Inter', 'Microsoft YaHei', '微软雅黑', 'Segoe UI', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
