/** Server-Sent Events client for API Tester (EventSource). */

export interface SseLogEntry {
  at: number;
  event: string;
  data: string;
}

export interface SseSession {
  close(): void;
  getLog(): SseLogEntry[];
}

export function connectSse(
  url: string,
  options?: {
    onLog?: (entry: SseLogEntry) => void;
    EventSourceImpl?: typeof EventSource;
  },
): SseSession {
  const ES = options?.EventSourceImpl ?? EventSource;
  const log: SseLogEntry[] = [];
  const es = new ES(url);
  const push = (event: string, data: string) => {
    const entry = { at: Date.now(), event, data };
    log.push(entry);
    options?.onLog?.(entry);
  };
  es.addEventListener('message', (ev) => push('message', (ev as MessageEvent).data));
  es.addEventListener('error', () => push('error', 'connection error'));
  es.addEventListener('open', () => push('open', 'connected'));
  return {
    close: () => es.close(),
    getLog: () => [...log],
  };
}
