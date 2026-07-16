import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * main 进程：只把 electron 和 node 内置模块标为 external，
 * 其余依赖（@rosever/shared、ws、iconv-lite、mysql2 等）全部打包进 bundle。
 * 否则打包成 exe 后 node_modules 不在场，会报 ERR_MODULE_NOT_FOUND。
 */
const externalMainOnly = () => ({
  name: 'external-main-only',
  enforce: 'pre' as const,
  resolveId(source: string) {
    // electron 和 node: 开头的内置模块保持 external
    if (source === 'electron' || source.startsWith('node:')) {
      return { id: source, external: true };
    }
    return null;
  },
});

/**
 * ws 包有两个可选原生依赖 bufferutil / utf-8-validate，
 * 它在源码里用 try { require('bufferutil') } catch 兜底成纯 JS 实现。
 * 但 rollup 打包成 ESM 时会把 try/catch 里的 require 提升成静态 import，
 * 导致运行时无条件报 "Could not resolve bufferutil"。
 *
 * 这里把它们 stub 成虚拟模块。关键：不能只导出空对象 {}——否则 ws 的
 * try/catch 不报错，会装上一个调用 undefined 的 mask 函数（大帧崩溃）。
 * 正确做法是在 stub 求值时设上 WS_NO_BUFFER_UTIL / WS_NO_UTF_8_VALIDATE
 * 环境变量，让 ws 直接跳过整段原生优化，全程用自带纯 JS 的 _mask/_unmask。
 * stub 模块是 ws 的依赖，在 bundle 里先于 ws 的检查执行，所以环境变量能生效。
 */
const STUB_WS_OPTIONALS = ['bufferutil', 'utf-8-validate'];
const stubWsOptionals = () => {
  const virtualIds = new Set(STUB_WS_OPTIONALS);
  const prefix = '\0ws-stub:';
  return {
    name: 'stub-ws-optionals',
    enforce: 'pre' as const,
    resolveId(source: string) {
      // 匹配裸模块名（含子路径，如 bufferutil/js 或 utf-8-validate/foo）
      const base = source.split('/')[0];
      if (virtualIds.has(base)) {
        return prefix + base;
      }
      return null;
    },
    load(id: string) {
      if (id.startsWith(prefix)) {
        const base = id.slice(prefix.length);
        const envVar =
          base === 'bufferutil'
            ? 'WS_NO_BUFFER_UTIL'
            : base === 'utf-8-validate'
              ? 'WS_NO_UTF_8_VALIDATE'
              : '';
        // 设环境变量让 ws 跳过原生优化（用纯 JS）。
        // 必须用 ESM 语法（export default），不能用 module.exports ——
        // main bundle 是 "type":"module"，module 在 ESM 作用域里未定义会抛 ReferenceError。
        // stub 的导出值实际不会被用到（env var 让 ws 跳过整段原生分支），只为占位。
        return envVar
          ? `process.env.${envVar} = '1';\nexport default {};`
          : 'export default {};';
      }
      return null;
    },
  };
};

export default defineConfig({
  main: {
    plugins: [externalMainOnly(), stubWsOptionals()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
        external: ['electron'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
      },
    },
  },
  renderer: {
    root: 'src',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') },
      },
    },
    plugins: [react()],
  },
});
