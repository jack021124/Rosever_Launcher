/**
 * MySQL 数据库管理 —— 连接测试、建库、导入、数据表浏览、玩家运维、账号管理、备份
 *
 * 连接信息默认从 inter_athena.conf 读取（login_server_id/pw/db 等）。
 * 所有用户输入参数走 mysql2 占位符，避免 SQL 注入。
 */
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as iconv from 'iconv-lite';
import { spawn } from 'node:child_process';
import { parseConf } from './confParser.js';
import type { MysqlConfig } from '../types.js';

/** conf 文件编码，与 confStore 保持一致 */
const CONF_ENCODING = 'gbk';

export interface ConnectResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface SqlImportResult {
  ok: boolean;
  file: string;
  error?: string;
}

/** 表结构信息 */
export interface TableInfo {
  name: string;
  rows: number;
  sizeMB: number;
}

/** 分页查询结果 */
export interface TableData {
  columns: string[];
  rows: unknown[][];
  total: number;
}

/** 账号信息 */
export interface AccountInfo {
  account_id: number;
  userid: string;
  sex: string;
  email: string;
  group_id: number;
  state: number;
  logincount: number;
  lastlogin: Date | null;
  last_ip: string;
}

/** 角色信息 */
export interface CharInfo {
  char_id: number;
  account_id: number;
  name: string;
  class: number;
  base_level: number;
  job_level: number;
  zeny: number;
  online: number;
}

export class DbManager {
  constructor(private serverRoot: string) {}

  /** 从 conf/inter_athena.conf 解析 MySQL 连接配置 */
  readConfig(): MysqlConfig {
    const path = join(this.serverRoot, 'conf/inter_athena.conf');
    const text = iconv.decode(readFileSync(path), CONF_ENCODING);
    const parsed = parseConf(text, 'conf/inter_athena.conf');
    const get = (key: string, fallback = '') =>
      parsed.items.find((i) => i.key === key && !i.disabled)?.value ?? fallback;
    return {
      host: get('login_server_ip', '127.0.0.1'),
      port: Number(get('login_server_port', '3306')),
      user: get('login_server_id', 'ragnarok'),
      password: get('login_server_pw', 'ragnarok'),
      database: get('login_server_db', 'ragnarok'),
    };
  }

  /** 测试连接（只连服务器，不依赖库是否存在） */
  async testConnection(cfg: MysqlConfig): Promise<ConnectResult> {
    try {
      const conn = await createConnection({ ...cfg, connectTimeout: 5000 });
      const [rows] = await conn.query('SELECT VERSION() AS v');
      const version = (rows as RowDataPacket[])[0]?.v;
      await conn.end();
      return { ok: true, version };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 创建数据库（如不存在） */
  async createDatabase(cfg: MysqlConfig): Promise<{ ok: boolean; error?: string }> {
    const { database, ...serverOnly } = cfg;
    try {
      const conn = await createConnection({ ...serverOnly, multipleStatements: true });
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
      await conn.end();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 导入一个 sql 文件（相对服务端根目录） */
  async importSql(cfg: MysqlConfig, relPath: string): Promise<SqlImportResult> {
    const abs = join(this.serverRoot, relPath);
    if (!existsSync(abs)) return { ok: false, file: relPath, error: '文件不存在' };
    try {
      const sql = readFileSync(abs, 'utf8');
      const conn = await this.connect(cfg);
      await conn.query(sql);
      await conn.end();
      return { ok: true, file: relPath };
    } catch (err) {
      return { ok: false, file: relPath, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 一键初始化：建库 + 导入核心 sql */
  async initialize(cfg: MysqlConfig): Promise<{ steps: SqlImportResult[]; createError?: string }> {
    const steps: SqlImportResult[] = [];
    const createRes = await this.createDatabase(cfg);
    if (!createRes.ok) return { steps, createError: createRes.error };
    for (const f of ['sql-files/main.sql', 'sql-files/logs.sql', 'sql-files/roulette_default_data.sql']) {
      steps.push(await this.importSql(cfg, f));
    }
    return { steps };
  }

  /** 获取连接（带库） */
  async connect(cfg: MysqlConfig): Promise<Connection> {
    return createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      multipleStatements: false,
    });
  }

  // ---- 数据表浏览 ----

  /** 列出所有表及其行数、大小 */
  async listTables(cfg: MysqlConfig): Promise<TableInfo[]> {
    const conn = await this.connect(cfg);
    try {
      const [rows] = await conn.query(
        `SELECT table_name AS name, table_rows AS rows, ROUND(data_length/1024/1024, 2) AS sizeMB
         FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
        [cfg.database],
      );
      return (rows as RowDataPacket[]).map((r) => ({
        name: r.name,
        rows: Number(r.rows) || 0,
        sizeMB: Number(r.sizeMB) || 0,
      }));
    } finally {
      await conn.end();
    }
  }

  /** 分页查询表数据，支持关键字搜索（跨所有列 LIKE） */
  async queryTable(cfg: MysqlConfig, table: string, page: number, pageSize: number, search: string): Promise<TableData> {
    const conn = await this.connect(cfg);
    try {
      // 取列名（用于显示和搜索）
      const [colRows] = await conn.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
        [cfg.database, table],
      );
      const columns = (colRows as RowDataPacket[]).map((r) => r.column_name as string);
      if (columns.length === 0) return { columns: [], rows: [], total: 0 };

      // 构造搜索条件（白名单校验表名，避免注入；表名来自 information_schema 已校验）
      let where = '';
      const params: unknown[] = [];
      if (search.trim()) {
        // 只对 varchar/text 类型列做 LIKE
        const conditions = columns.map((c) => `\`${c}\` LIKE ?`).join(' OR ');
        where = `WHERE ${conditions}`;
        const kw = `%${search.trim()}%`;
        columns.forEach(() => params.push(kw));
      }

      // 总数
      const [countRows] = await conn.query(`SELECT COUNT(*) AS cnt FROM \`${table}\` ${where}`, params);
      const total = Number((countRows as RowDataPacket[])[0]?.cnt || 0);

      // 分页数据
      const offset = (page - 1) * pageSize;
      const [dataRows] = await conn.query(
        `SELECT * FROM \`${table}\` ${where} LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      );
      const rows = (dataRows as RowDataPacket[]).map((r) => columns.map((c) => formatCell(r[c])));

      return { columns, rows, total };
    } finally {
      await conn.end();
    }
  }

  // ---- 账号管理 ----

  /** 账号列表（分页 + userid 搜索） */
  async listAccounts(cfg: MysqlConfig, page: number, pageSize: number, search: string): Promise<{ rows: AccountInfo[]; total: number }> {
    const conn = await this.connect(cfg);
    try {
      let where = '';
      const params: unknown[] = [];
      if (search.trim()) {
        where = 'WHERE userid LIKE ? OR email LIKE ? OR last_ip LIKE ?';
        const kw = `%${search.trim()}%`;
        params.push(kw, kw, kw);
      }
      const [c] = await conn.query(`SELECT COUNT(*) AS cnt FROM login ${where}`, params);
      const total = Number((c as RowDataPacket[])[0]?.cnt || 0);
      const offset = (page - 1) * pageSize;
      const [r] = await conn.query(
        `SELECT account_id, userid, sex, email, group_id, state, logincount, lastlogin, last_ip
         FROM login ${where} ORDER BY account_id LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      );
      return { rows: r as AccountInfo[], total };
    } finally {
      await conn.end();
    }
  }

  /** 注册账号 */
  async createAccount(cfg: MysqlConfig, userid: string, userPass: string, sex: 'M' | 'F', email: string): Promise<{ ok: boolean; error?: string }> {
    const conn = await this.connect(cfg);
    try {
      await conn.query('INSERT INTO login (userid, user_pass, sex, email) VALUES (?, ?, ?, ?)', [userid, userPass, sex, email]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await conn.end();
    }
  }

  /** 删除账号（连同角色） */
  async deleteAccount(cfg: MysqlConfig, accountId: number): Promise<{ ok: boolean; error?: string }> {
    const conn = await this.connect(cfg);
    try {
      await conn.query('DELETE FROM char WHERE account_id = ?', [accountId]);
      await conn.query('DELETE FROM login WHERE account_id = ?', [accountId]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await conn.end();
    }
  }

  /** 修改账号 group_id（GM 等级） */
  async setGroup(cfg: MysqlConfig, accountId: number, groupId: number): Promise<{ ok: boolean; error?: string }> {
    const conn = await this.connect(cfg);
    try {
      await conn.query('UPDATE login SET group_id = ? WHERE account_id = ?', [groupId, accountId]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await conn.end();
    }
  }

  /** 重置密码 */
  async setPassword(cfg: MysqlConfig, accountId: number, newPass: string): Promise<{ ok: boolean; error?: string }> {
    const conn = await this.connect(cfg);
    try {
      await conn.query('UPDATE login SET user_pass = ? WHERE account_id = ?', [newPass, accountId]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await conn.end();
    }
  }

  /** 封禁/解封（state=5 为封禁，0 为正常） */
  async setBanState(cfg: MysqlConfig, accountId: number, banned: boolean): Promise<{ ok: boolean; error?: string }> {
    const conn = await this.connect(cfg);
    try {
      await conn.query('UPDATE login SET state = ? WHERE account_id = ?', [banned ? 5 : 0, accountId]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await conn.end();
    }
  }

  // ---- 角色管理 ----

  /** 查某账号下的角色 */
  async listChars(cfg: MysqlConfig, accountId: number): Promise<CharInfo[]> {
    const conn = await this.connect(cfg);
    try {
      const [r] = await conn.query(
        `SELECT char_id, account_id, name, class, base_level, job_level, zeny, online
         FROM char WHERE account_id = ? ORDER BY char_num`,
        [accountId],
      );
      return r as CharInfo[];
    } finally {
      await conn.end();
    }
  }

  /** 改角色 Zeny */
  async setZeny(cfg: MysqlConfig, charId: number, zeny: number): Promise<{ ok: boolean; error?: string }> {
    const conn = await this.connect(cfg);
    try {
      await conn.query('UPDATE char SET zeny = ? WHERE char_id = ?', [zeny, charId]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await conn.end();
    }
  }

  /** 删除角色 */
  async deleteChar(cfg: MysqlConfig, charId: number): Promise<{ ok: boolean; error?: string }> {
    const conn = await this.connect(cfg);
    try {
      await conn.query('DELETE FROM char WHERE char_id = ?', [charId]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await conn.end();
    }
  }

  // ---- 在线玩家 ----

  /** 在线玩家列表（online=1） */
  async onlinePlayers(cfg: MysqlConfig): Promise<{ char_id: number; name: string; account_id: number; base_level: number; class: number }[]> {
    const conn = await this.connect(cfg);
    try {
      const [r] = await conn.query(
        `SELECT char_id, name, account_id, base_level, class FROM char WHERE online = 1 ORDER BY name`,
      );
      return r as { char_id: number; name: string; account_id: number; base_level: number; class: number }[];
    } finally {
      await conn.end();
    }
  }

  // ---- 备份 / 导出 ----

  /**
   * 用 mysqldump 导出整库到文件。
   * 依赖系统 PATH 里的 mysqldump（随 MySQL 安装）。
   */
  async backupDatabase(cfg: MysqlConfig, outAbsPath: string): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const args = [
        `-h${cfg.host}`,
        `-P${cfg.port}`,
        `-u${cfg.user}`,
        `-p${cfg.password}`,
        '--default-character-set=utf8mb4',
        cfg.database,
      ];
      const child = spawn('mysqldump', args, { windowsHide: true });
      const chunks: Buffer[] = [];
      child.stdout.on('data', (b: Buffer) => chunks.push(b));
      const errChunks: Buffer[] = [];
      child.stderr.on('data', (b: Buffer) => errChunks.push(b));
      child.on('error', (err) => resolve({ ok: false, error: '无法启动 mysqldump（请确认已安装 MySQL 并加入 PATH）: ' + err.message }));
      child.on('exit', (code) => {
        if (code === 0) {
          writeFileSync(outAbsPath, Buffer.concat(chunks));
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: iconv.decode(Buffer.concat(errChunks), CONF_ENCODING) || `mysqldump 退出码 ${code}` });
        }
      });
    });
  }
}

/** 格式化单元格值为可显示字符串 */
function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleString('zh-CN', { hour12: false });
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
