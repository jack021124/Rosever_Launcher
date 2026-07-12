/**
 * 进程管理器 —— launcher 本地与 agent 共用
 *
 * 负责：
 *  - 用 child_process.spawn 拉起 5 个 .exe（cwd 必须是服务端根目录）
 *  - 捕获 stdout/stderr 日志（替代黑框）
 *  - 监听 exit 判断崩溃（code > 1）→ 延时自动重启守护
 *  - 提供 start/stop/restart/getStatus
 *
 * BetterRA 服务端路径约定：所有 exe 与其依赖 DLL、conf/ 都在同一个根目录，
 * 因此 spawn 时必须把 cwd 设为服务端根目录（对应 runserver.bat 的 cd %SOURCE_DIR%）。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as iconv from 'iconv-lite';
import { SERVICES, type ServiceId, type ServiceStatus, type RunState, type LogEntry, type LogLevel } from '../types.js';

/**
 * BetterRA 服务端在中文 Windows 上输出 GBK(cp936) 编码。
 * Node 默认按 UTF-8 解码会导致中文乱码，因此用 iconv-lite 按 GBK 解码。
 * 此外 data 事件不保证按行分割，多字节字符可能被 chunk 截断，
 * 所以每个服务维护一个 Buffer 缓冲，按换行符切出完整行，残留字节留到下次。
 */
const OUTPUT_ENCODING = 'gbk';

/** 崩溃后重启延时 (ms)，对应 serv.bat 的 PING -n 15 */
const RESTART_DELAY_MS = 15_000;
/** 退出码 > 1 视为崩溃（对应 serv.bat 的 ERRORLEVEL 2） */
const CRASH_THRESHOLD = 1;

/** 日志回调 */
export type LogHandler = (entry: LogEntry) => void;
/** 状态变更回调 */
export type StatusHandler = (status: ServiceStatus) => void;

interface ManagedProcess {
  service: ServiceId;
  child: ChildProcess | null;
  state: RunState;
  pid?: number;
  startedAt?: number;
  restartCount: number;
  lastExitCode?: number;
  lastError?: string;
  /** 重启定时器 */
  restartTimer: NodeJS.Timeout | null;
  /** 是否处于守护模式（崩溃自动重启） */
  supervise: boolean;
  /** 用户主动停止标记（停止时不触发自动重启） */
  stopping: boolean;
  /** stdout 行缓冲区（累积未以换行结尾的原始字节，避免多字节字符被 chunk 截断） */
  outBuf: Buffer;
}

export class ProcessManager {
  private procs = new Map<ServiceId, ManagedProcess>();
  private logHandler: LogHandler | null = null;
  private statusHandler: StatusHandler | null = null;
  private serverRoot: string;

  constructor(serverRoot: string) {
    this.serverRoot = serverRoot;
    for (const s of SERVICES) {
      this.procs.set(s.id, {
        service: s.id,
        child: null,
        state: 'stopped',
        restartCount: 0,
        restartTimer: null,
        supervise: false,
        stopping: false,
        outBuf: Buffer.alloc(0),
      });
    }
  }

  onLog(handler: LogHandler) {
    this.logHandler = handler;
  }
  onStatus(handler: StatusHandler) {
    this.statusHandler = handler;
  }

  /** 启动单个服务 */
  start(id: ServiceId, supervise = true): void {
    const mp = this.procs.get(id);
    if (!mp) return;
    if (mp.state === 'running' || mp.state === 'starting') return;

    const meta = SERVICES.find((s) => s.id === id)!;
    mp.supervise = supervise;
    mp.stopping = false;
    mp.state = 'starting';
    mp.outBuf = Buffer.alloc(0);
    this.emitStatus(mp);

    const child = spawn(meta.exe, [], {
      cwd: this.serverRoot,
      // 隐藏原生控制台黑框，输出由启动器/agent 接管显示
      windowsHide: true,
      env: { ...process.env },
    });

    mp.child = child;
    mp.startedAt = Date.now();

    child.stdout?.on('data', (chunk: Buffer) => {
      this.consumeBuffer(id, chunk, false);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.consumeBuffer(id, chunk, true);
    });

    child.on('exit', (code, signal) => {
      mp.lastExitCode = code ?? undefined;
      const wasRunning = mp.state === 'running';
      // flush 缓冲区残留的最后未换行输出
      this.flushBuffer(id);

      if (mp.stopping) {
        // 用户主动停止
        mp.state = 'stopped';
        mp.child = null;
        mp.pid = undefined;
        this.emitStatus(mp);
        return;
      }

      // 崩溃判定：code > CRASH_THRESHOLD 或被信号杀死
      const crashed = (code !== null && code > CRASH_THRESHOLD) || signal !== null;
      if (crashed && mp.supervise) {
        mp.state = 'crashed';
        mp.restartCount += 1;
        mp.child = null;
        this.emitStatus(mp);
        this.log(id, 'error', `${meta.name} 已崩溃 (code=${code}, signal=${signal})，${RESTART_DELAY_MS / 1000}s 后自动重启`);
        mp.restartTimer = setTimeout(() => this.start(id, mp.supervise), RESTART_DELAY_MS);
      } else {
        mp.state = 'stopped';
        mp.child = null;
        mp.pid = undefined;
        this.emitStatus(mp);
        if (wasRunning) {
          this.log(id, code === 0 ? 'status' : 'warning', `${meta.name} 已退出 (code=${code})`);
        }
      }
    });

    child.on('error', (err) => {
      mp.lastError = err.message;
      mp.state = 'crashed';
      this.emitStatus(mp);
      this.log(id, 'error', `启动失败: ${err.message}`);
    });

    if (child.pid) {
      mp.pid = child.pid;
      mp.state = 'running';
      this.emitStatus(mp);
      this.log(id, 'status', `${meta.name} 已启动 (pid=${child.pid})`);
    }
  }

  /** 停止单个服务 */
  stop(id: ServiceId): void {
    const mp = this.procs.get(id);
    if (!mp || !mp.child) return;
    mp.stopping = true;
    mp.state = 'stopping';
    if (mp.restartTimer) {
      clearTimeout(mp.restartTimer);
      mp.restartTimer = null;
    }
    this.emitStatus(mp);
    // Windows 下树形 kill
    if (mp.pid) {
      try {
        process.kill(mp.pid);
      } catch {
        /* 进程可能已退出 */
      }
    }
  }

  /** 重启 */
  restart(id: ServiceId): void {
    const mp = this.procs.get(id);
    if (!mp) return;
    if (mp.child) {
      mp.stopping = true;
      // 停止后延迟重启
      const orig = mp.child;
      orig.once('exit', () => setTimeout(() => this.start(id, mp.supervise), 500));
      this.stop(id);
    } else {
      this.start(id, mp.supervise);
    }
  }

  /** 全部启动 */
  startAll(): void {
    for (const s of SERVICES) this.start(s.id, true);
  }

  /** 全部停止 */
  stopAll(): void {
    for (const s of SERVICES) this.stop(s.id);
  }

  /** 获取单个状态快照 */
  getStatus(id: ServiceId): ServiceStatus {
    return this.toStatus(this.procs.get(id)!);
  }

  /** 全部状态快照 */
  getAllStatus(): ServiceStatus[] {
    return SERVICES.map((s) => this.toStatus(this.procs.get(s.id)!));
  }

  /** 关闭所有进程（退出清理） */
  dispose(): void {
    this.stopAll();
    for (const mp of this.procs.values()) {
      if (mp.restartTimer) clearTimeout(mp.restartTimer);
    }
  }

  // ---- 内部 ----

  private toStatus(mp: ManagedProcess): ServiceStatus {
    return {
      id: mp.service,
      state: mp.state,
      pid: mp.pid,
      startedAt: mp.startedAt,
      restartCount: mp.restartCount,
      lastExitCode: mp.lastExitCode,
      lastError: mp.lastError,
    };
  }

  private emitStatus(mp: ManagedProcess) {
    this.statusHandler?.(this.toStatus(mp));
  }

  private log(service: ServiceId, level: LogLevel, text: string) {
    this.logHandler?.({ service, level, text, ts: Date.now() });
  }

  /**
   * 累积输出字节，按换行符切出完整行后再 GBK 解码。
   * 这样多字节字符即便被 chunk 截断也能正确还原。
   * 进程结束时残留的未换行内容也会被 flush 出来。
   */
  private consumeBuffer(service: ServiceId, chunk: Buffer, isError: boolean) {
    const mp = this.procs.get(service);
    if (!mp) return;
    mp.outBuf = Buffer.concat([mp.outBuf, chunk]);

    // 按换行符切出完整行，最后一段可能不完整，保留到 outBuf
    let idx: number;
    while ((idx = mp.outBuf.indexOf(0x0a)) >= 0) {
      const lineBuf = mp.outBuf.subarray(0, idx);
      // 跳过 \r
      const trimmed = lineBuf[lineBuf.length - 1] === 0x0d
        ? lineBuf.subarray(0, -1)
        : lineBuf;
      mp.outBuf = mp.outBuf.subarray(idx + 1);
      this.parseLine(service, trimmed, isError);
    }
  }

  /** flush 缓冲区中残留的未换行内容（进程退出时调用） */
  private flushBuffer(service: ServiceId) {
    const mp = this.procs.get(service);
    if (!mp || mp.outBuf.length === 0) return;
    let buf = mp.outBuf;
    if (buf[buf.length - 1] === 0x0d) buf = buf.subarray(0, -1);
    this.parseLine(service, buf, false);
    mp.outBuf = Buffer.alloc(0);
  }

  /** 解码单行并发出日志 */
  private parseLine(service: ServiceId, lineBuf: Buffer, isError: boolean) {
    if (lineBuf.length === 0) return;
    const raw = iconv.decode(lineBuf, OUTPUT_ENCODING);
    if (raw.trim() === '') return;
    const clean = stripAnsi(raw);
    const level = isError ? 'error' : detectLevel(clean);
    this.log(service, level, clean);
  }
}

/** 剥离 ANSI 颜色码 */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** 根据前缀识别日志级别 */
function detectLevel(line: string): LogLevel {
  const m = line.match(/\[(Status|Info|Notice|Warning|Error|Debug|SQL|CLI|Cli)\]/i);
  if (!m) return 'info';
  switch (m[1].toLowerCase()) {
    case 'status': return 'status';
    case 'info': return 'info';
    case 'notice': return 'notice';
    case 'warning': return 'warning';
    case 'error': return 'error';
    case 'debug': return 'debug';
    case 'sql': return 'sql';
    case 'cli': return 'cli';
    default: return 'info';
  }
}
