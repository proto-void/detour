/** WebSocket client helpers for API Tester (browser WebSocket). */

export interface WsLogEntry {
  at: number;
  direction: 'in' | 'out' | 'sys';
  text: string;
}

export interface WsSession {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  getLog(): WsLogEntry[];
}

export function connectWebSocket(
  url: string,
  options?: {
    protocols?: string | string[];
    onLog?: (entry: WsLogEntry) => void;
    WebSocketImpl?: typeof WebSocket;
  },
): Promise<WsSession> {
  const WS = options?.WebSocketImpl ?? WebSocket;
  const log: WsLogEntry[] = [];
  const push = (direction: WsLogEntry['direction'], text: string) => {
    const entry = { at: Date.now(), direction, text };
    log.push(entry);
    options?.onLog?.(entry);
  };

  return new Promise((resolve, reject) => {
    const ws = new WS(url, options?.protocols);
    ws.addEventListener('open', () => {
      push('sys', 'connected');
      resolve({
        send(data: string) {
          ws.send(data);
          push('out', data);
        },
        close(code, reason) {
          ws.close(code, reason);
        },
        getLog: () => [...log],
      });
    });
    ws.addEventListener('message', (ev) => {
      push('in', typeof ev.data === 'string' ? ev.data : '[binary]');
    });
    ws.addEventListener('error', () => {
      push('sys', 'error');
      reject(new Error('WebSocket error'));
    });
    ws.addEventListener('close', (ev) => {
      push('sys', `closed ${ev.code} ${ev.reason || ''}`.trim());
    });
  });
}
