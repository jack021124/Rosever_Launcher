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
import { toImportPath } from '../types.js';
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

  /**
   * 从各 athena conf 文件读取服务的实际监听端口。
   * 用于「服务控制」页显示真实端口（而非硬编码默认值）。
   *
   * 读取规则：
   *   login  ← conf/login_athena.conf : login_port
   *   char   ← conf/char_athena.conf  : char_port
   *   map    ← conf/map_athena.conf   : map_port
   *   web    ← conf/web_athena.conf   : web_port
   *   websocket ← conf/websocket_athena.conf : robrowser_port
   *
   * 文件不存在或 key 缺失时，对应端口返回 null（调用方可用 SERVICES 默认值兜底）。
   */
  readServicePorts(): Record<string, number | null> {
    const result: Record<string, number | null> = {};
    const targets: { id: string; conf: string; key: string }[] = [
      { id: 'login', conf: 'conf/login_athena.conf', key: 'login_port' },
      { id: 'char', conf: 'conf/char_athena.conf', key: 'char_port' },
      { id: 'map', conf: 'conf/map_athena.conf', key: 'map_port' },
      { id: 'web', conf: 'conf/web_athena.conf', key: 'web_port' },
      { id: 'websocket', conf: 'conf/websocket_athena.conf', key: 'robrowser_port' },
    ];
    for (const t of targets) {
      const abs = join(this.opts.serverRoot, t.conf);
      if (!existsSync(abs)) {
        result[t.id] = null;
        continue;
      }
      try {
        const text = iconv.decode(readFileSync(abs), CONF_ENCODING);
        const parsed = parseConf(text, t.conf);
        const item = parsed.items.find((i) => i.key === t.key && !i.disabled);
        result[t.id] = item ? Number(item.value) : null;
      } catch {
        result[t.id] = null;
      }
    }
    return result;
  }

  // ==================== 安全覆盖模式（import/ override）====================

  /**
   * 读取 import 覆盖文件里属于该 conf 的段落。
   * - battle 类（conf/battle/*.conf）：从 battle_conf.txt 提取 `// battle/xxx.conf` 分区
   * - 非 battle 类：整个 import 文件内容
   * import 文件不存在时返回空字符串。
   */
  readImport(relPath: string): string {
    const importPath = toImportPath(relPath);
    if (!importPath) return '';
    const importAbs = join(this.opts.serverRoot, importPath);
    if (!existsSync(importAbs)) return '';
    const importText = iconv.decode(readFileSync(importAbs), CONF_ENCODING);

    // battle 类：提取分区
    if (importPath.endsWith('battle_conf.txt')) {
      return this.extractBattleSection(importText, relPath);
    }
    return importText;
  }

  /**
   * 合并原文件 + import 覆盖，返回最终生效值。
   * 用户在「安全覆盖」模式下看到的就是这个合并结果。
   *
   * 合并逻辑：逐行扫描原文件，如果某行的 key 在 import 覆盖项里，替换其 value；
   * import 里有但原文件没有的 key 追加到末尾。
   */
  readMerged(relPath: string): { mergedText: string; originalText: string } {
    const originalText = this.readText(relPath);
    const overrideText = this.readImport(relPath);

    // 没有覆盖项，直接返回原文
    if (!overrideText.trim()) {
      return { mergedText: originalText, originalText };
    }

    const overrides = parseKeyValues(overrideText);
    const origLines = originalText.replace(/\r\n/g, '\n').split('\n');
    const mergedLines = origLines.map((line) => {
      const parsed = parseKeyValueLine(line);
      if (parsed && overrides.has(parsed.key)) {
        // 用覆盖值替换，保留原行的 disabled 状态和 key
        return `${parsed.disabled ? '//' : ''}${parsed.key}: ${overrides.get(parsed.key)}`;
      }
      return line;
    });

    // 追加原文件里没有的 key（用户新增的）
    const origKeys = new Set<string>();
    for (const line of origLines) {
      const p = parseKeyValueLine(line);
      if (p) origKeys.add(p.key);
    }
    const appended: string[] = [];
    for (const [key, value] of overrides) {
      if (!origKeys.has(key)) {
        appended.push(`${key}: ${value}`);
      }
    }
    if (appended.length > 0) {
      mergedLines.push('', '// 以下为覆盖文件追加的项', ...appended);
    }

    return { mergedText: mergedLines.join('\n'), originalText };
  }

  /**
   * 安全覆盖模式保存：把用户编辑后的文本与原文件 diff，
   * 只把改过的行写入 import 覆盖文件。
   * @returns 备份文件相对路径
   */
  saveImport(relPath: string, editedText: string): string {
    const importPath = toImportPath(relPath);
    if (!importPath) {
      throw new Error('该文件不支持安全覆盖');
    }
    const originalText = this.readText(relPath);
    const origMap = new Map<string, string>();
    for (const line of originalText.replace(/\r\n/g, '\n').split('\n')) {
      const p = parseKeyValueLine(line);
      if (p) origMap.set(p.key, p.value);
    }

    // 提取 diff：用户新值 ≠ 原值的，或原文件里没有的新 key
    const diff: string[] = [];
    for (const line of editedText.replace(/\r\n/g, '\n').split('\n')) {
      const p = parseKeyValueLine(line);
      if (!p) continue; // 注释、空行、标题行不写
      const origVal = origMap.get(p.key);
      if (origVal === undefined || origVal !== p.value) {
        diff.push(`${p.key}: ${p.value}`);
      }
    }

    const importAbs = join(this.opts.serverRoot, importPath);

    // battle 类：更新 battle_conf.txt 里该文件的分区，保留其他分区
    if (importPath.endsWith('battle_conf.txt')) {
      const section = this.formatBattleSection(relPath, diff);
      const existing = existsSync(importAbs) ? iconv.decode(readFileSync(importAbs), CONF_ENCODING) : '';
      const updated = replaceBattleSection(existing, relPath, section);
      const backupRel = this.backupIfExists(importPath);
      this.atomicWrite(importAbs, updated);
      return backupRel;
    }

    // 非 battle 类：diff 整体写入 import 文件
    const backupRel = this.backupIfExists(importPath);
    this.atomicWrite(importAbs, diff.join('\r\n') + (diff.length > 0 ? '\r\n' : ''));
    return backupRel;
  }

  /** 从 battle_conf.txt 全文里提取属于 relPath 的分区内容 */
  private extractBattleSection(battleConfText: string, relPath: string): string {
    const header = `// ${relPath}`;
    const lines = battleConfText.replace(/\r\n/g, '\n').split('\n');
    let inSection = false;
    const result: string[] = [];
    for (const line of lines) {
      if (line.startsWith('// conf/battle/') || line.startsWith('// battle/')) {
        // 遇到下一个分区头
        if (inSection) break;
        if (line.trim() === header || line.trim() === `// ${relPath.replace('conf/', '')}`) {
          inSection = true;
        }
        continue;
      }
      if (inSection) {
        result.push(line);
      }
    }
    return result.join('\n').trim();
  }

  /** 生成 battle_conf.txt 里一个分区的文本（含分区头） */
  private formatBattleSection(relPath: string, diffLines: string[]): string {
    // 分区头用去掉 conf/ 前缀的路径（battle/exp.conf），和 rAthena 惯例一致
    const header = relPath.replace(/^conf\//, '');
    const body = diffLines.length > 0 ? diffLines.join('\r\n') + '\r\n' : '';
    return `// ${header}\r\n${body}`;
  }

  /** 备份（文件存在才备份，不存在返回空串）。用于 import 文件写入前 */
  private backupIfExists(relPath: string): string {
    const abs = join(this.opts.serverRoot, relPath);
    if (!existsSync(abs)) return '';
    return this.backup(relPath);
  }

  /** 原子写入（GBK 编码 + 临时文件 rename） */
  private atomicWrite(abs: string, text: string): void {
    const dir = dirname(abs);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = abs + '.rosever-tmp';
    writeFileSync(tmp, iconv.encode(text, CONF_ENCODING));
    renameSync(tmp, abs);
  }
}

// ==================== conf 行解析工具函数 ====================

/** 一行的解析结果：key/value/disabled */
interface ParsedLine {
  key: string;
  value: string;
  disabled: boolean;
}

/**
 * 解析单行 conf，识别 `key: value` 或 `//key: value`（被注释禁用）。
 * 返回 null 表示该行不是配置项（注释、空行、标题分隔线等）。
 *
 * 重要：key 必须以**小写字母**开头且至少 2 个字符。
 * rAthena/BetterRA 的所有配置项 key 都是小写蛇形命名（server_name、login_port…），
 * 从未出现过单字母或大写字母开头的 key。
 * 不能放宽到 [\w.]+ 或 [a-zA-Z_]，因为 conf 注释里大量出现：
 *   - `0: 没有限制`、`1: 使用邮件验证`（枚举说明，数字开头）
 *   - `X: 若是其他非0的数字…`（占位符说明，大写单字母）
 * 这些都不是配置项，必须跳过。
 */
function parseKeyValueLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // 标题分隔线（//==== 或 //-----）
  if (/^\/\/[=\-]{3,}/.test(trimmed)) return null;
  let disabled = false;
  let rest = trimmed;
  // 行首 // 表示禁用
  if (rest.startsWith('//')) {
    disabled = true;
    rest = rest.slice(2).trimStart();
    // 禁用行里如果是普通注释（// 后面没有冒号），跳过
  }
  // 匹配 key: value（冒号分隔，key 以小写字母开头，至少 2 字符）
  const m = rest.match(/^([a-z][a-z0-9_.]+)\s*:\s*(.*)$/);
  if (!m) return null;
  return { key: m[1], value: m[2].trim(), disabled };
}

/**
 * 从整段文本里解析出所有 key→value 映射（后出现的覆盖先出现的）。
 * 用于 import 覆盖项。
 */
function parseKeyValues(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const p = parseKeyValueLine(line);
    if (p) map.set(p.key, p.value);
  }
  return map;
}

/**
 * 在 battle_conf.txt 全文里替换属于 relPath 的分区。
 * 其他文件的分区保持不动。relPath 不存在则追加到末尾。
 */
function replaceBattleSection(battleConfText: string, relPath: string, newSection: string): string {
  const header = relPath.replace(/^conf\//, ''); // 如 battle/exp.conf
  const headerMarker = `// ${header}`;
  const lines = battleConfText.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let replaced = false;

  while (i < lines.length) {
    const line = lines[i];
    // 匹配分区头：// battle/xxx.conf 或 // conf/battle/xxx.conf
    if (line.trim() === headerMarker || line.trim() === `// conf/${header}`) {
      // 跳过整个旧分区（到下一个分区头或文件末尾）
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (next.startsWith('// battle/') || next.startsWith('// conf/battle/')) break;
        i++;
      }
      // 插入新分区
      out.push(newSection.replace(/\r\n/g, '\n').trimEnd());
      replaced = true;
      continue;
    }
    out.push(line);
    i++;
  }

  // 没找到旧分区 → 追加
  if (!replaced && newSection.trim()) {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
    out.push(newSection.replace(/\r\n/g, '\n').trimEnd());
  }

  return out.join('\r\n');
}
