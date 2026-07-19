/**
 * 主题定义 —— 所有预设主题集中在此。
 *
 * 每套主题是一组 CSS 变量值（RGB 三元组字符串，配合 tailwind 的
 * rgb(var(--xxx) / <alpha-value>) 语法）。
 * 运行时由 applyTheme 把对应主题的变量写到 document.documentElement.style。
 *
 * 加新主题只需在 THEMES 数组里加一项，无需改 CSS 或其他文件。
 */

export interface ThemeColors {
  /** 背景层级 */
  '--bg-base': string;
  '--bg-panel': string;
  '--bg-hover': string;
  '--bg-active': string;
  '--bg-input': string;
  /** 强调色 */
  '--accent': string;
  '--accent-hover': string;
  '--accent-dim': string;
  /** 文字 */
  '--text-primary': string;
  '--text-secondary': string;
  '--text-muted': string;
  /** 状态色 */
  '--status-running': string;
  '--status-stopped': string;
  '--status-crashed': string;
  '--status-warning': string;
  /** 边框 */
  '--border': string;
  '--border-strong': string;
}

export interface ThemeDef {
  id: string;
  name: string;
  /** "dark" 或 "light"，用于决定 CodeEditor 用哪套语法高亮 */
  mode: 'dark' | 'light';
  colors: ThemeColors;
  /** 用于设置页预览：主背景 + 强调色（组合成色块） */
  swatch: { bg: string; accent: string };
}

export const THEMES: ThemeDef[] = [
  {
    id: 'dark-purple',
    name: '深色 · 紫',
    mode: 'dark',
    swatch: { bg: '#1E1E2E', accent: '#8A2BE2' },
    colors: {
      '--bg-base': '30 30 46',
      '--bg-panel': '37 37 53',
      '--bg-hover': '45 45 64',
      '--bg-active': '51 51 74',
      '--bg-input': '24 24 40',
      '--accent': '138 43 226',
      '--accent-hover': '157 68 232',
      '--accent-dim': '107 31 184',
      '--text-primary': '255 255 255',
      '--text-secondary': '160 160 184',
      '--text-muted': '107 107 133',
      '--status-running': '74 222 128',
      '--status-stopped': '107 107 133',
      '--status-crashed': '239 68 68',
      '--status-warning': '251 191 36',
      '--border': '54 54 80',
      '--border-strong': '74 74 106',
    },
  },
  {
    id: 'dark-blue',
    name: '深色 · 蓝',
    mode: 'dark',
    swatch: { bg: '#1A1B26', accent: '#3B82F6' },
    colors: {
      '--bg-base': '26 27 38',
      '--bg-panel': '36 38 54',
      '--bg-hover': '44 46 66',
      '--bg-active': '52 55 80',
      '--bg-input': '20 21 32',
      '--accent': '59 130 246',
      '--accent-hover': '96 165 250',
      '--accent-dim': '37 99 235',
      '--text-primary': '255 255 255',
      '--text-secondary': '148 163 184',
      '--text-muted': '100 116 139',
      '--status-running': '74 222 128',
      '--status-stopped': '100 116 139',
      '--status-crashed': '248 113 113',
      '--status-warning': '251 191 36',
      '--border': '51 65 85',
      '--border-strong': '71 85 105',
    },
  },
  {
    id: 'dark-green',
    name: '深色 · 绿',
    mode: 'dark',
    swatch: { bg: '#1A1E1A', accent: '#10B981' },
    colors: {
      '--bg-base': '26 30 26',
      '--bg-panel': '34 40 34',
      '--bg-hover': '42 50 42',
      '--bg-active': '50 60 50',
      '--bg-input': '20 24 20',
      '--accent': '16 185 129',
      '--accent-hover': '52 211 153',
      '--accent-dim': '5 150 105',
      '--text-primary': '255 255 255',
      '--text-secondary': '156 178 156',
      '--text-muted': '100 116 100',
      '--status-running': '74 222 128',
      '--status-stopped': '100 116 100',
      '--status-crashed': '248 113 113',
      '--status-warning': '251 191 36',
      '--border': '46 60 46',
      '--border-strong': '66 80 66',
    },
  },
  {
    id: 'dark-rose',
    name: '深色 · 玫红',
    mode: 'dark',
    swatch: { bg: '#1E1A20', accent: '#EC4899' },
    colors: {
      '--bg-base': '30 26 32',
      '--bg-panel': '40 34 42',
      '--bg-hover': '50 42 52',
      '--bg-active': '60 50 64',
      '--bg-input': '24 20 26',
      '--accent': '236 72 153',
      '--accent-hover': '244 114 182',
      '--accent-dim': '190 24 93',
      '--text-primary': '255 255 255',
      '--text-secondary': '180 160 184',
      '--text-muted': '120 100 124',
      '--status-running': '74 222 128',
      '--status-stopped': '120 100 124',
      '--status-crashed': '248 113 113',
      '--status-warning': '251 191 36',
      '--border': '56 44 58',
      '--border-strong': '76 62 78',
    },
  },
  {
    id: 'dark-orange',
    name: '深色 · 橙',
    mode: 'dark',
    swatch: { bg: '#1E1A16', accent: '#F59E0B' },
    colors: {
      '--bg-base': '30 26 22',
      '--bg-panel': '40 34 28',
      '--bg-hover': '50 42 34',
      '--bg-active': '60 50 40',
      '--bg-input': '24 20 16',
      '--accent': '245 158 11',
      '--accent-hover': '251 191 36',
      '--accent-dim': '217 119 6',
      '--text-primary': '255 255 255',
      '--text-secondary': '184 168 140',
      '--text-muted': '124 108 84',
      '--status-running': '74 222 128',
      '--status-stopped': '124 108 84',
      '--status-crashed': '248 113 113',
      '--status-warning': '251 191 36',
      '--border': '56 46 34',
      '--border-strong': '76 62 46',
    },
  },
  {
    id: 'light-clean',
    name: '亮色 · 简约',
    mode: 'light',
    swatch: { bg: '#F7F7FA', accent: '#8A2BE2' },
    colors: {
      '--bg-base': '247 247 250',
      '--bg-panel': '255 255 255',
      '--bg-hover': '238 238 245',
      '--bg-active': '228 228 240',
      '--bg-input': '247 247 252',
      '--accent': '138 43 226',
      '--accent-hover': '122 30 210',
      '--accent-dim': '180 130 230',
      '--text-primary': '30 30 46',
      '--text-secondary': '90 90 110',
      '--text-muted': '130 130 150',
      '--status-running': '34 160 90',
      '--status-stopped': '130 130 150',
      '--status-crashed': '220 50 50',
      '--status-warning': '200 140 20',
      '--border': '220 220 232',
      '--border-strong': '200 200 216',
    },
  },
  {
    id: 'light-blue',
    name: '亮色 · 蓝',
    mode: 'light',
    swatch: { bg: '#F1F5F9', accent: '#3B82F6' },
    colors: {
      '--bg-base': '241 245 249',
      '--bg-panel': '255 255 255',
      '--bg-hover': '226 232 240',
      '--bg-active': '214 222 234',
      '--bg-input': '248 250 252',
      '--accent': '59 130 246',
      '--accent-hover': '37 99 235',
      '--accent-dim': '147 197 253',
      '--text-primary': '30 41 59',
      '--text-secondary': '71 85 105',
      '--text-muted': '120 130 145',
      '--status-running': '34 160 90',
      '--status-stopped': '120 130 145',
      '--status-crashed': '220 50 50',
      '--status-warning': '200 140 20',
      '--border': '203 213 225',
      '--border-strong': '180 190 205',
    },
  },
];

/** 默认主题 id */
export const DEFAULT_THEME = 'dark-purple';

/** 根据 id 查找主题，找不到则回退默认 */
export function getTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/* ============================================
   字体与高亮自定义设置（叠在主题变量之上）
   ============================================ */

/** 可选的字体族（UI 下拉用） */
export const FONT_OPTIONS_SANS = [
  { id: 'system', label: '系统默认', value: "'Microsoft YaHei', '微软雅黑', 'Segoe UI', sans-serif" },
  { id: 'inter', label: 'Inter', value: "'Inter', 'Microsoft YaHei', sans-serif" },
  { id: 'yahei', label: '微软雅黑', value: "'Microsoft YaHei', '微软雅黑', sans-serif" },
  { id: 'simhei', label: '黑体', value: "'SimHei', '黑体', sans-serif" },
  { id: 'kai', label: '楷体', value: "'KaiTi', '楷体', sans-serif" },
  { id: 'song', label: '宋体', value: "'SimSun', '宋体', sans-serif" },
];

export const FONT_OPTIONS_MONO = [
  { id: 'cascadia', label: 'Cascadia Code', value: "'Cascadia Code', 'Consolas', monospace" },
  { id: 'consolas', label: 'Consolas', value: "'Consolas', monospace" },
  { id: 'couriernew', label: 'Courier New', value: "'Courier New', monospace" },
  { id: 'sarasa', label: '更纱黑体', value: "'Sarasa Mono SC', 'Consolas', monospace" },
  { id: 'simsun', label: '新宋体', value: "'NSimSun', '新宋体', monospace" },
];

/** 默认字体变量（主题不写这俩，由自定义层提供兜底） */
export const DEFAULT_FONT_SANS = "'Inter', 'Microsoft YaHei', '微软雅黑', 'Segoe UI', 'sans-serif'";
export const DEFAULT_FONT_MONO = "'Cascadia Code', 'Consolas', monospace";
export const DEFAULT_FONT_SIZE_BASE = 14;
export const DEFAULT_CE_FONT_SIZE = 12;
export const DEFAULT_CE_LINE_HEIGHT = 1.6;

/**
 * 用户自定义设置（持久化在 localStorage）。
 * 每个字段 undefined/null 表示"用主题默认"，自定义层会跳过该字段。
 */
export interface CustomSettings {
  /** 界面字体（sans），null = 主题默认 */
  fontSans: string | null;
  /** 代码字体（mono），null = 主题默认 */
  fontMono: string | null;
  /** 界面基础字号（px），null = 默认 14 */
  fontSizeBase: number | null;
  /** 代码字号（px），null = 默认 12 */
  ceFontSize: number | null;
  /** 代码行高，null = 默认 1.6 */
  ceLineHeight: number | null;
  /** 高亮颜色覆盖（key = '--ce-key' 等，value = 'r g b'）。
   *  空对象 = 用 index.css 里深/浅两套默认高亮配色 */
  highlight: Record<string, string>;
}

export function defaultCustomSettings(): CustomSettings {
  return {
    fontSans: null,
    fontMono: null,
    fontSizeBase: null,
    ceFontSize: null,
    ceLineHeight: null,
    highlight: {},
  };
}
