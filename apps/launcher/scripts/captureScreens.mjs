/**
 * 截图模式（被 main.ts 在 app.whenReady 后调用，环境变量 CAPTURE_SCREENS=1 触发）。
 *
 * 流程：
 *   1. 窗口加载完毕后，等渲染层把首屏渲染好
 *   2. 用 executeJavaScript 依次把 hash 切到每个路由
 *   3. 等待一小段时间让页面拉完数据 + 渲染
 *   4. webContents.capturePage() 截全屏，保存到 docs/screenshots/
 *   5. 全部截完 app.quit()
 *
 * 路由表与 README 里功能段一一对应，文件名按 kebab-case。
 *
 * 用法：
 *   cd apps/launcher
 *   CAPTURE_SCREENS=1 SERVER_ROOT="F:/下载/Compressed/BetterRA_Done_Dev" \
 *     npx electron-vite dev
 *   或对构建产物：
 *   CAPTURE_SCREENS=1 npx electron .
 *
 * 说明：
 *   - 关闭确认对话框在截图模式下跳过（mainWindow.__skipCloseConfirm = true）
 *   - 窗口不显示（show:false）后台静默截图，不会闪屏
 *   - 截图分辨率 = 窗口大小（1280×800 默认），可在 ROUTES 外的 SIZE 配置
 */
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

// 截图输出目录：项目根的 docs/screenshots/
// process.cwd() 在 electron-vite dev 下是 apps/launcher，所以回退到 ../..
const OUT_DIR = join(process.cwd(), '..', '..', 'docs', 'screenshots');

// 窗口尺寸（也是截图分辨率）
export const CAPTURE_SIZE = { width: 1280, height: 800 };

/**
 * 要截的路由。name 是文件名（不含扩展名），hash 是路由路径。
 * 顺序按 README 功能段排列。
 */
const ROUTES = [
  { name: 'service-control', hash: '/',            wait: 1800 }, // 首页要拉端口 + MySQL 探测
  { name: 'config',          hash: '/config',      wait: 1200 },
  { name: 'npc-scripts',     hash: '/npc',         wait: 1200 },
  { name: 'database',        hash: '/database',    wait: 1500 },
  { name: 'logs',            hash: '/logs',        wait: 1000 },
  { name: 'data-tools',      hash: '/tools/data',  wait: 1000 },
  { name: 'map-tools',       hash: '/tools/map',   wait: 1000 },
  { name: 'settings',        hash: '/settings',    wait: 1000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 主入口：传入已加载好页面的 BrowserWindow，依次截图。
 * @returns Promise<void>，截完后调用方负责 quit
 */
export async function captureScreens(win) {
  mkdirSync(OUT_DIR, { recursive: true });
  const wc = win.webContents;

  // 等渲染层首屏 + store 初始化（loadServerRoot / useServiceEvents）
  await sleep(2500);

  const results = [];
  for (const route of ROUTES) {
    try {
      // 项目用 HashRouter（见 src/main.tsx），导航链接形如 #/config。
      // 改 location.hash 即可触发 react-router 路由切换（hashchange 事件）。
      const currentHash = await wc.executeJavaScript(`window.location.hash`);
      const targetHash = '#' + route.hash;
      console.log(`[capture] 切换前: ${currentHash || '(空)'}  → 目标: ${targetHash}`);
      await wc.executeJavaScript(`window.location.hash = ${JSON.stringify(targetHash)};`);
      // 等页面切换 + 数据请求 + 渲染
      await sleep(route.wait);

      const img = await wc.capturePage();
      const file = join(OUT_DIR, `${route.name}.png`);
      // NativeImage 没有 toFile，用 fs 写 PNG buffer
      writeFileSync(file, img.toPNG());
      const size = img.getSize();
      results.push({ ok: true, name: route.name, file, size });
      console.log(`[capture] ✓ ${route.name} → ${file} (${size.width}×${size.height})`);
    } catch (err) {
      results.push({ ok: false, name: route.name, error: String(err) });
      console.error(`[capture] ✗ ${route.name}:`, err);
    }
  }

  console.log(`\n[capture] 完成 ${results.filter((r) => r.ok).length}/${results.length} 张截图 → ${OUT_DIR}`);
  return results;
}
