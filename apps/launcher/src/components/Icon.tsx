import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** 通用 stroke 图标基类 */
function Svg({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Dashboard: (p: IconProps) => (
    <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>
  ),
  Power: (p: IconProps) => (
    <Svg {...p}><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></Svg>
  ),
  Settings: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>
  ),
  Database: (p: IconProps) => (
    <Svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></Svg>
  ),
  Log: (p: IconProps) => (
    <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></Svg>
  ),
  Server: (p: IconProps) => (
    <Svg {...p}><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><path d="M6 6h.01M6 18h.01" /></Svg>
  ),
  Tool: (p: IconProps) => (
    <Svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></Svg>
  ),
  Map: (p: IconProps) => (
    <Svg {...p}><path d="M9 18l-6-3V6l6 3 6-3 6 3v9l-6-3-6 3" /><path d="M9 9v9M15 6v9" /></Svg>
  ),
  Play: (p: IconProps) => (
    <Svg {...p}><polygon points="5 3 19 12 5 21 5 3" /></Svg>
  ),
  Stop: (p: IconProps) => (
    <Svg {...p}><rect x="5" y="5" width="14" height="14" rx="1" /></Svg>
  ),
  Refresh: (p: IconProps) => (
    <Svg {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></Svg>
  ),
  Save: (p: IconProps) => (
    <Svg {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></Svg>
  ),
  Clock: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>
  ),
  Plus: (p: IconProps) => (
    <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
  ),
  Search: (p: IconProps) => (
    <Svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>
  ),
  Check: (p: IconProps) => (
    <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>
  ),
  Folder: (p: IconProps) => (
    <Svg {...p}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z" /></Svg>
  ),
  Help: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Svg>
  ),
  Sun: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></Svg>
  ),
  Moon: (p: IconProps) => (
    <Svg {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></Svg>
  ),
  Script: (p: IconProps) => (
    <Svg {...p}><path d="M4 4v16" /><path d="M20 4v16" /><path d="M4 4h16" /><path d="M4 20h16" /><polyline points="9 9 12 12 9 15" /></Svg>
  ),
  Chevron: (p: IconProps) => (
    <Svg {...p}><polyline points="9 18 15 12 9 6" /></Svg>
  ),
};

export type IconName = keyof typeof Icon;
