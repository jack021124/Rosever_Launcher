/**
 * rAthena / BetterRA conf 文件解析器
 *
 * 格式特点：
 *   - 以 // 开头的行是注释（BetterRA 注释极其详尽，是重要帮助信息）
 *   - 配置行形如  key: value
 *   - 被注释禁用的配置行形如  //key: value
 *   - 写回时必须保留所有注释、空行、原顺序、禁用状态
 *
 * 解析策略：逐行扫描，把每个配置项上方连续的 // 注释聚合为它的 help 文本，
 * 同时据注释关键词推断值类型（百分比/枚举/掩码/开关/数字/字符串）。
 */
import type { ConfFile, ConfItem, ConfValueType, EnumOption, MaskBit } from '../types.js';

/** 把 "0x10"/"16"/"32" 统一解析成十进制数字 */
function parseBitToken(tok: string): number | null {
  const t = tok.trim().toLowerCase();
  if (/^0x[0-9a-f]+$/.test(t)) return parseInt(t, 16);
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

/** 判断是否为 2 的幂次方（1/2/4/8/16/...），用于区分位掩码与普通枚举 */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** 分隔线 //------------ 或 //============ （至少 5 个连续 = 或 -） */
const SEP_RE = /^\/\/\s*[-=]{5,}/;
/** 仅 === 分隔线（章节标题上下边框） */
const EQ_SEP_RE = /^\/\/\s*={5,}/;

/**
 * 配置行：[//]key: value
 *   - key 必须以字母或下划线开头（[A-Za-z_][\w.]*），允许带点（如 feature.buying_store）
 *   - 用以排除注释里说明文字「// 1: 玩家」「// 0x01: 启用」「// 0: 不能」这类伪配置项
 *   - 可选前缀 // 表示被注释禁用的配置行；// 后允许至多一个空格（与注释段落区分）
 */
const CONF_LINE_RE = /^(\/\/ ?)?([A-Za-z_][\w.]*)\s*:\s*(.*?)\s*$/;

/** 推断值类型：扫描该配置项的 help 文本 */
function inferType(value: string, help: string | undefined): {
  type: ConfValueType;
  options?: EnumOption[];
  maskBits?: MaskBit[];
} {
  const v = value.trim().toLowerCase();
  const h = help ?? '';

  // 开关
  if (v === 'yes' || v === 'no' || v === 'on' || v === 'off') {
    return { type: 'boolean' };
  }

  const hasMaskKeyword = h.includes('掩码选项');

  // 掩码：注释含「掩码选项」关键词，并且能从注释里解析出至少 2 个位定义
  if (hasMaskKeyword) {
    const bits = parseMaskBits(h);
    if (bits.length >= 2) {
      return { type: 'mask', maskBits: bits };
    }
    // 关键词命中但解析不出位定义 → 退化为数字
    if (/^(0x[0-9a-f]+|-?\d+)$/i.test(v)) {
      return { type: 'number' };
    }
    return { type: 'string' };
  }

  // 枚举：注释含「0: 文字」「1 = 文字」这种连续两行以上的值定义
  const enumOpts = parseEnumOptions(h);
  if (enumOpts.length >= 2) {
    // 位组合检测：若选项里「至少 3 个」是 2 的幂（1/2/4/8/16...），
    // 且非 2 幂的选项最多 1 个（容忍 0=全关 或 4095=全选 这种快捷值），
    // 判定为「相加组合」的位掩码，用多选按钮而非单选下拉。
    // 典型：console_silent（1/2/4/8/16/32）、player_cloak_check_type（0/1/2/4）、save_settings（1/2/.../4095）。
    // 要求「≥3 个 2 幂」是为了和 1/2/3 这种连续 enum 区分（后者只有 2 个 2 幂）。
    const nums = enumOpts.map((o) => Number(o.value));
    const powerCount = nums.filter((n) => isPowerOfTwo(n)).length;
    const nonPowerCount = nums.length - powerCount;
    if (powerCount >= 3 && nonPowerCount <= 1) {
      return {
        type: 'mask',
        maskBits: enumOpts.map((o) => ({ bit: Number(o.value), label: o.label })),
      };
    }
    return { type: 'enum', options: enumOpts };
  }

  // 百分比
  if (h.includes('百分比选项') || h.includes('百分比')) {
    return { type: 'percent' };
  }

  // 纯数字
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    return { type: 'number' };
  }
  return { type: 'string' };
}

/** 从注释里解析掩码位：匹配 `0x001: 走路` / `1: 玩家` / `0x10: xxx` */
function parseMaskBits(help: string): MaskBit[] {
  const bits: MaskBit[] = [];
  // 行首（含可选缩进）的数字/十六进制 + 冒号（中英）+ 文字说明
  const re = /(?:^|\n)\s*(0x[0-9a-fA-F]+|\d+)\s*[:：]\s*([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(help)) !== null) {
    const bit = parseBitToken(m[1]);
    const label = m[2].trim();
    if (bit === null || label.length === 0) continue;
    // 过滤太长的（多半是说明正文，不是位定义）
    if (label.length > 30) continue;
    bits.push({ bit, label });
  }
  // 去重（按 bit）
  const seen = new Set<number>();
  return bits.filter((b) => {
    if (seen.has(b.bit)) return false;
    seen.add(b.bit);
    return true;
  });
}

/** 从注释里解析枚举选项：匹配 `0 = xxx` / `1: xxx` / `2 = xxx` 这类 */
function parseEnumOptions(help: string): EnumOption[] {
  const opts: EnumOption[] = [];
  // 匹配 "数字 = 文字" 或 "数字: 文字"，数字在行首或紧跟某些字符
  const re = /(?:^|\n)\s*(\d+)\s*[:：=]\s*([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(help)) !== null) {
    const val = Number(m[1]);
    const label = m[2].trim();
    // 过滤掉明显不是选项的（label 以数字开头 = 多半是正文里的数值描述）
    // 长度放宽到 80：BetterRA 中文注释经常超过 40 字
    if (label.length > 0 && label.length < 80 && !label.match(/^\d/)) {
      opts.push({ value: val, label });
    }
  }
  // 去重
  const seen = new Set<number | string>();
  return opts.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

/** 从多行 help 中取第一行非空作为简短标签 */
function extractLabel(help: string): string | undefined {
  const first = help
    .split('\n')
    .map((l) => l.replace(/^\/\/\s?/, '').trim())
    .find((l) => l.length > 0 && !SEP_RE.test('// ' + l));
  if (!first) return undefined;
  // 去掉尾部括号说明如 "(开关选项)" "(百分比选项)"
  return first.replace(/[（(].*?[)）]\s*$/, '').trim();
}

/**
 * 解析整个 conf 文本
 */
export function parseConf(text: string, filePath: string): ConfFile {
  const lines = text.split(/\r?\n/);
  const items: ConfItem[] = [];
  /** 暂存当前配置项上方的注释行 */
  let pendingComments: string[] = [];
  /**
   * 「同组」继承：BetterRA 经常一段注释下连续多个配置项
   *   // 设置玩家防御, 魔法防御... 的最大值
   *   pc_max_def: 0      ← 有注释
   *   pc_max_def2: 0     ← 无注释，复用上面的说明
   * 这里记录上一个有注释项的 label/help，让无注释项继承。
   * 空行/分隔线/header 会清空（表示新的一组开始）。
   */
  let lastLabel: string | undefined;
  let lastHelp: string | undefined;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNo = idx + 1;

    // 空行：隔断注释归属 + 同组继承（避免把上一个项的尾巴挂到下一个项）
    if (line.trim() === '') {
      pendingComments = [];
      lastLabel = undefined;
      lastHelp = undefined;
      continue;
    }

    // 章节标题识别：
    //   //===================================
    //   // 鼠标密码系统(Pincode System)       ← 标题
    //   //===================================
    // 也兼容单行 // ===== 标题 ===== 这种
    if (EQ_SEP_RE.test(line.trim())) {
      const next = lines[idx + 1];
      const afterNext = lines[idx + 2];
      const isTitleFollowed =
        next !== undefined && next.trimStart().startsWith('//') && !SEP_RE.test(next.trim());
      const isClosedByEq =
        afterNext !== undefined && EQ_SEP_RE.test(afterNext.trim());
      if (isTitleFollowed && isClosedByEq) {
        const title = next.replace(/^\/\/\s?/, '').trim();
        items.push({
          key: `__header_${lineNo}`,
          value: title,
          type: 'header',
          label: title,
          disabled: false,
          line: lineNo,
          dirty: false,
        });
        pendingComments = [];
        lastLabel = undefined;
        lastHelp = undefined;
        idx += 2; // 跳过标题行和下边框
        continue;
      }
      // 上下无边框的孤立 === 分隔线：仅作分隔，不生成项
      pendingComments = [];
      lastLabel = undefined;
      lastHelp = undefined;
      continue;
    }

    // 普通分隔线 //------------
    if (SEP_RE.test(line.trim())) {
      pendingComments = [];
      lastLabel = undefined;
      lastHelp = undefined;
      continue;
    }

    // 注释行（但不是被禁用的配置行 //key:）
    // 先判断是不是被注释禁用的配置行
    const confMatch = line.match(CONF_LINE_RE);
    if (confMatch) {
      const disabled = confMatch[1] !== undefined; // 形如 "//key:" 或 "// key:"
      const key = confMatch[2];
      const value = confMatch[3];

      // value 合理性校验：conf 的真实值是短 token（数字/yes/no/IP/短英文），
      // 不会是整段中文句子。若 value 含中文且超过 20 字，或以中文标点结尾，
      // 视为注释里的说明文字而非配置项。
      const looksLikeProse = /[\u4e00-\u9fff]/.test(value) && (
        value.length > 20 || /[。！？，；:、]$/.test(value.trim())
      );
      if (looksLikeProse) {
        // 当作普通注释行累积
        pendingComments.push(line);
        continue;
      }

      // key 含字母且像配置键（排除纯 import: 等指令也保留）
      const hasOwnHelp = pendingComments.length > 0;
      const help = hasOwnHelp
        ? pendingComments.map((c) => c.replace(/^\/\/\s?/, '')).join('\n').trim()
        : lastHelp; // 无自身注释时继承同组上一个项的说明

      const { type, options, maskBits } = inferType(value, help);
      const label = hasOwnHelp
        ? extractLabel(help as string)
        : (lastLabel ?? key); // 无自身注释时继承同组标签

      items.push({
        key,
        value,
        type,
        options,
        maskBits,
        help: help && help.length > 0 ? help : undefined,
        label,
        disabled,
        line: lineNo,
        dirty: false,
      });

      // 只有有自身注释的项才更新「同组」基线；无注释的项不改基线，
      // 这样一组里的第 2/3/4 个都指向第 1 个的 label/help。
      if (hasOwnHelp) {
        lastLabel = label;
        lastHelp = help;
      }
      pendingComments = [];
      continue;
    }

    // import: 指令行 —— 不作为配置项，但隔断同组继承
    if (/^\s*import:\s*/.test(line)) {
      pendingComments = [];
      lastLabel = undefined;
      lastHelp = undefined;
      continue;
    }

    // 普通注释行 —— 累积
    if (line.trimStart().startsWith('//')) {
      pendingComments.push(line);
      continue;
    }

    // 其它无法识别的行
    pendingComments = [];
  }

  return { path: filePath, items, lineCount: lines.length };
}

/**
 * 把配置项写回原文本，保留所有注释、空行、顺序、禁用状态。
 * 只更新 items 中 dirty=true 的项；其余原样保留。
 */
export function writeConf(originalText: string, updates: { key: string; value: string; disabled: boolean }[]): string {
  const lines = originalText.split(/\r?\n/);
  // 按 key 索引最新值
  const updateMap = new Map(updates.map((u) => [u.key, u]));

  const newLines = lines.map((line) => {
    const m = line.match(CONF_LINE_RE);
    if (!m) return line;
    const key = m[2];
    if (!updateMap.has(key)) return line;

    const u = updateMap.get(key)!;
    const prefix = u.disabled ? '//' : '';
    // 保持原有的缩进
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    return `${indent}${prefix}${key}: ${u.value}`;
  });

  return newLines.join('\r\n');
}
