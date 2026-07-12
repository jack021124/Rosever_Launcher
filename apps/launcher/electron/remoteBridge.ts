/**
 * RemoteBridge —— launcher 主进程端的远程 Agent 连接管理
 *
 * 职责：
 *   1. 维护一条到 Agent 的 WebSocket 长连接
 *   2. hello 认证握手 → 收到 welcome + status 快照
 *   3. rpc(method, args) → 发送 RpcRequest，配对 RpcResult，20 秒超时
 *   4. 接收 Agent 推送的 status / log，回调上层（main 转发到 webContents）
 *   5. 断线自动重连（指数退避，最多 30 秒）
 *
 * 这个类跑在 Electron 主进程，不与渲染进程直接打交道；
 * main.ts 把它的推送通过 webContents.send 转发出去。
 */
import WebSocket from 'ws';
import type {
  HelloMsg,
  WelcomeMsg,
  RpcRequest,
  RpcResult,
  StatusDeltaMsg,
  StatusSnapshotMsg,
  LogStreamMsg,
  ByeMsg,
  ServiceStatus,
  LogEntry,
  MysqlConfig,
} from '@rosever/shared';

export type ConnState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'disconnected'
  | 'rejected';

export interface RemoteTarget {
  host: string;
  port: number;
  token: string;
}

export interface PushHandlers {
  /** 单服务状态变化 */
  onStatus?: (s: ServiceStatus) => void;
  /** 全量状态快照（连接后首次） */
  onStatusSnapshot?: (all: ServiceStatus[]) => void;
  /** 单条日志 */
  onLog?: (e: LogEntry) => void;
  /** Agent 主动断开 */
  onBye?: (reason: string) => void;
  /** 连接状态变化 */
  onState?: (state: ConnState, detail?: string) => void;
  /** 认证成功，拿到 Agent 端的 serverRoot 和 dbConfig */
  onWelcome?: (info: { agentVersion: string; serverRoot: string; dbConfig: MysqlConfig }) => void;
}

interface PendingRpc {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

const RPC_TIMEOUT_MS = 20_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class RemoteBridge {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRpc>();
  private state: ConnState = 'idle';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private disposed = false;
  private current: RemoteTarget | null = null;

  constructor(private handlers: PushHandlers = {}) {}

  getState(): ConnState {
    return this.state;
  }

  /**
   * 连接到指定 Agent。若已有连接会先断开。
   */
  connect(target: RemoteTarget, clientVersion: string): void {
    this.disposed = false;
    this.current = target;
    this.cleanupSocket();
    this.doConnect(clientVersion);
  }

  /** 完全销毁（不再重连） */
  dispose(): void {
    this.disposed = true;
    this.current = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.failAllPending(new Error('连接已关闭'));
    this.setState('idle');
  }

  /** 主动断开（保留 target，可被 connect 再次唤醒） */
  disconnect(): void {
    this.disposed = true;
    this.cleanupSocket();
    this.failAllPending(new Error('连接已断开'));
    this.setState('disconnected');
  }

  /**
   * 发起一次 RPC 调用，返回 Agent 的结果。
   * @throws Error 远程失败 / 超时 / 未连接
   */
  rpc(method: string, args: unknown[]): Promise<unknown> {
    if (this.state !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('未连接到 Agent'));
    }
    const id = this.nextId++;
    const req: RpcRequest = { type: 'rpc', id, method, args };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC 超时: ${method}`));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(req), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`发送失败: ${err.message}`));
        }
      });
    });
  }

  // ---------- 内部 ----------

  private doConnect(clientVersion: string) {
    if (!this.current) return;
    const { host, port, token } = this.current;
    const url = `ws://${host}:${port}`;
    this.setState('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      this.scheduleReconnect(clientVersion);
      return;
    }
    this.ws = ws;
    this.setState('authenticating');

    const helloTimer = setTimeout(() => {
      if (this.state !== 'connected') {
        try { ws.terminate(); } catch { /* ignore */ }
      }
    }, 6000);

    ws.on('open', () => {
      const hello: HelloMsg = { type: 'hello', token, clientVersion };
      ws.send(JSON.stringify(hello));
    });

    ws.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.handleMessage(msg, helloTimer);
    });

    ws.on('close', (code, reasonBuf) => {
      clearTimeout(helloTimer);
      const reason = reasonBuf?.toString() ?? '';
      // 4001/4003 表示被拒绝（IP/Token），不要重连
      if (code === 4001 || code === 4003) {
        this.setState('rejected', reason || (code === 4003 ? 'Token 错误' : 'IP 不在白名单'));
        this.handlers.onBye?.(reason);
        return;
      }
      this.failAllPending(new Error(`连接关闭 (${code})`));
      this.scheduleReconnect(clientVersion);
    });

    ws.on('error', () => {
      // close 事件会跟进，这里不重复处理
    });
  }

  private handleMessage(msg: any, helloTimer: NodeJS.Timeout) {
    switch (msg?.type) {
      case 'welcome': {
        clearTimeout(helloTimer);
        this.reconnectAttempt = 0;
        this.setState('connected');
        const w = msg as WelcomeMsg;
        this.handlers.onWelcome?.({
          agentVersion: w.agentVersion,
          serverRoot: w.serverRoot,
          dbConfig: w.dbConfig,
        });
        break;
      }
      case 'status.snapshot': {
        const m = msg as StatusSnapshotMsg;
        this.handlers.onStatusSnapshot?.(m.services);
        // 也把每条单独走一次 onStatus，保证 store 一致更新
        for (const s of m.services) this.handlers.onStatus?.(s);
        break;
      }
      case 'status': {
        this.handlers.onStatus?.((msg as StatusDeltaMsg).status);
        break;
      }
      case 'log': {
        this.handlers.onLog?.((msg as LogStreamMsg).entry);
        break;
      }
      case 'bye': {
        const reason = (msg as ByeMsg).reason;
        this.handlers.onBye?.(reason);
        this.failAllPending(new Error(`Agent 断开: ${reason}`));
        // bye 之后连接会被关，不主动重连
        break;
      }
      case 'rpc.result': {
        const r = msg as RpcResult;
        const p = this.pending.get(r.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(r.id);
          if (r.ok) p.resolve(r.result);
          else p.reject(new Error(r.error ?? '远程调用失败'));
        }
        break;
      }
      default:
        // 未知消息，忽略
        break;
    }
  }

  private scheduleReconnect(clientVersion: string) {
    if (this.disposed || !this.current) return;
    this.reconnectAttempt++;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.reconnectAttempt - 1), RECONNECT_MAX_MS);
    this.setState('disconnected', `将在 ${Math.round(delay / 1000)}s 后重连…`);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed && this.current) this.doConnect(clientVersion);
    }, delay);
  }

  private cleanupSocket() {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private failAllPending(err: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private setState(s: ConnState, detail?: string) {
    this.state = s;
    this.handlers.onState?.(s, detail);
  }
}
