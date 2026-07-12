/**
 * esbuild 单文件打包配置
 *
 * 产物：dist/agent.js（含 ws/mysql2/iconv-lite 全部 bundle）
 * 部署：拷 dist/agent.js + agent.json 到服务器，node agent.js 运行
 *
 * 注意：mysql2 含原生绑定（node_modules/.build）无法 bundle，
 * 这里用 --packages=external 让 mysql2 保留 require，运行时需要服务器有 node_modules。
 * 若服务器无法装 mysql2，可暂时禁用 db:* 功能（agent 仍能跑 service/conf）。
 */
import { build } from 'esbuild';

const opts = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  // 用 cjs 输出：ws 等 CJS 依赖的 require 才能正常工作
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/agent.cjs',
  // mysql2 含可选原生依赖，保留 external 以求稳妥（其余如 ws/iconv-lite 都 bundle）
  external: ['mysql2'],
  banner: {
    js: '// Rosever Agent - 单文件打包产物（由 esbuild.config.mjs 生成）\n',
  },
  logLevel: 'info',
};

await build(opts);
console.log('✓ 打包完成: dist/agent.cjs');
