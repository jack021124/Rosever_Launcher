/**
 * conf 文件读写服务 —— 封装文件 IO + 解析 + 备份 + 原子写入
 *
 * launcher 主进程与 agent 共用。约定路径都是相对服务端根目录的相对路径
 * （如 "conf/battle/exp.conf"），由调用方提供 serverRoot。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import * as iconv from 'iconv-lite';
import { parseConf, writeConf } from './confParser.js';
import type { ConfFile } from '../types.js';

/**
 * conf 文件编码：中文 Windows 下 BetterRA 的 conf 是 GBK(cp936)。
 * 用 UTF-8 读写会导致中文注释乱码，所以全部走 iconv-lite 的 GBK 编解码。
 */
const CONF_ENCODING = 'gbk';

export interface ConfStoreOptions {
  serverRoot: string;
}

export class ConfStore {
  constructor(private opts: ConfStoreOptions) {}

  /** 读取并解析一个 conf 文件（GBK 解码） */
  read(relPath: string): ConfFile {
    return parseConf(this.readText(relPath), relPath);
  }

  /** 读取 conf 原始文本（GBK 解码），供保存时还原注释 */
  readText(relPath: string): string {
    const abs = join(this.opts.serverRoot, relPath);
    return iconv.decode(readFileSync(abs), CONF_ENCODING);
  }

  /**
   * 直接把整段文本写回 conf 文件（不经解析）。
   * 仍走备份 + 原子写入 + GBK 编码。供「纯文本编辑」模式用。
   * @returns 备份文件相对路径
   */
  saveText(relPath: string, text: string): string {
    const abs = join(this.opts.serverRoot, relPath);
    const backupRel = this.backup(relPath);
    const tmp = abs + '.rosever-tmp';
    writeFileSync(tmp, iconv.encode(text, CONF_ENCODING));
    renameSync(tmp, abs);
    return backupRel;
  }

  /**
   * 保存修改。写前自动备份到 conf/.backup/，原子写入（临时文件+rename）。
   * 全程保持 GBK 编码。
   * @param relPath 相对路径
   * @param originalText 原始文件全文（用于 writeConf 还原注释）
   * @param updates 仅被修改的项
   * @returns 备份文件相对路径
   */
  save(relPath: string, originalText: string, updates: { key: string; value: string; disabled: boolean }[]): string {
    const abs = join(this.opts.serverRoot, relPath);
    // 1. 生成新文本（保留注释/顺序/禁用项）
    const newText = writeConf(originalText, updates);
    // 2. 备份原文件
    const backupRel = this.backup(relPath);
    // 3. 原子写入：GBK 编码，先写临时文件再 rename
    const tmp = abs + '.rosever-tmp';
    writeFileSync(tmp, iconv.encode(newText, CONF_ENCODING));
    renameSync(tmp, abs);
    return backupRel;
  }

  /** 备份当前文件到 conf/.backup/时间戳/ ，返回备份的相对路径 */
  private backup(relPath: string): string {
    const abs = join(this.opts.serverRoot, relPath);
    if (!existsSync(abs)) return '';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = join(this.opts.serverRoot, dirname(relPath), '.backup', ts.slice(0, 10));
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const backupName = `${basename(relPath)}.${ts.slice(11, 19).replace(/-/g, '')}`;
    const backupAbs = join(backupDir, backupName);
    writeFileSync(backupAbs, readFileSync(abs));
    return join(dirname(relPath), '.backup', ts.slice(0, 10), backupName).replace(/\\/g, '/');
  }

  /** 列出某目录下的 conf 文件（用于 battle 二级导航等） */
  listConfFiles(dirRel: string): string[] {
    const dir = join(this.opts.serverRoot, dirRel);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.conf'))
      .map((f) => `${dirRel}/${f}`.replace(/\\/g, '/'));
  }

  /**
   * 递归列出某目录下所有 .conf 文件（含子目录），
   * 返回相对 serverRoot 的路径（正斜杠），按字母序排序。
   * 用于「脚本配置」页扫描 npc/ 下的 scripts_*.conf。
   * 跳过隐藏目录与 .backup 目录。
   */
  listConfTree(dirRel: string): string[] {
    const root = join(this.opts.serverRoot, dirRel);
    if (!existsSync(root)) return [];
    const results: string[] = [];
    const walk = (dirAbs: string): void => {
      let entries;
      try {
        entries = readdirSync(dirAbs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === '.backup') continue;
        const childAbs = join(dirAbs, entry.name);
        if (entry.isDirectory()) {
          walk(childAbs);
        } else if (entry.isFile() && entry.name.endsWith('.conf')) {
          results.push(relative(this.opts.serverRoot, childAbs).replace(/\\/g, '/'));
        }
      }
    };
    walk(root);
    return results.sort();
  }

  /**
   * 新建一个 conf 文件（若不存在）。
   * 用于「脚本配置」页的「新建」功能：用户输入文件名，直接在指定目录创建空 conf。
   * 已存在则返回错误（不覆盖），避免误操作。
   * @param relPath 相对 serverRoot 的完整路径（含 .conf 后缀）
   * @returns 创建后的相对路径
   */
  createConf(relPath: string): string {
    const abs = join(this.opts.serverRoot, relPath);
    if (existsSync(abs)) {
      throw new Error(`文件已存在: ${relPath}`);
    }
    const dir = dirname(abs);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // 写入 conf 标准头部注释（CRLF 换行，与 BetterRA conf 风格一致）
    const header =
      '// ==============================================================\r\n' +
      `// ${basename(relPath)}\r\n` +
      '// ==============================================================\r\n' +
      '// npc: npc/path/to/your_script.txt\r\n' +
      '\r\n';
    writeFileSync(abs, iconv.encode(header, CONF_ENCODING));
    return relPath;
  }
}
