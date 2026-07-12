/**
 * 工具执行器 —— 调用服务端自带的工具 exe，捕获输出
 *
 * 对应 BetterRA 服务端的工具：
 *  - csv2yaml.exe / yaml2sql.exe / yamlupgrade.exe （数据格式转换）
 *  - mapcache.exe （地图缓存重建）
 *  - navigenerator （导航数据生成）
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as iconv from 'iconv-lite';

export interface ToolDef {
  /** 可执行文件名 */
  exe: string;
  /** 显示名 */
  name: string;
  /** 说明 */
  description: string;
  /** 执行参数（相对服务端根目录的文件等） */
  defaultArgs?: string[];
}

/** BetterRA 自带工具清单 */
export const TOOLS: readonly ToolDef[] = [
  { exe: 'csv2yaml.exe', name: 'csv2yaml', description: '将 CSV 数据转换为 YAML 格式' },
  { exe: 'yaml2sql.exe', name: 'yaml2sql', description: '将 YAML 数据转换为 SQL 语句' },
  { exe: 'yamlupgrade.exe', name: 'yamlupgrade', description: '升级 YAML 数据格式到新版本' },
  { exe: 'mapcache.exe', name: 'mapcache', description: '重建地图缓存', defaultArgs: ['rebuild'] },
  { exe: 'navigenerator.exe', name: 'navigenerator', description: '生成导航数据' },
] as const;

export interface ToolResult {
  ok: boolean;
  /** 合并的 stdout+stderr 输出 */
  output: string;
  exitCode: number | null;
  error?: string;
}

export class ToolRunner {
  constructor(private serverRoot: string) {}

  /**
   * 运行一个工具 exe。
   * @param exe 可执行文件名（如 "csv2yaml.exe"）
   * @param args 参数
   */
  async run(exe: string, args: string[] = []): Promise<ToolResult> {
    return new Promise((resolve) => {
      const child = spawn(exe, args, {
        cwd: this.serverRoot,
        windowsHide: false,
      });
      const chunks: Buffer[] = [];
      const collect = (b: Buffer) => chunks.push(b);
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);

      child.on('error', (err) => {
        resolve({ ok: false, output: '', exitCode: null, error: err.message });
      });

      child.on('exit', (code) => {
        const output = iconv.decode(Buffer.concat(chunks), 'gbk');
        resolve({
          ok: code === 0,
          output,
          exitCode: code,
          error: code !== 0 && code !== null ? `退出码 ${code}` : undefined,
        });
      });
    });
  }

  /** 列出可用的工具（检查 exe 是否存在） */
  listAvailable(): Promise<ToolDef[]> {
    return Promise.resolve(
      TOOLS.filter((t) => existsSync(join(this.serverRoot, t.exe))),
    );
  }
}
