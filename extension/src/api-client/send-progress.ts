/** Progress reported while a request body is in flight. */
export interface SendProgress {
  /** waiting = headers not yet received; downloading = reading body. */
  phase: 'waiting' | 'downloading';
  elapsedMs: number;
  bytesReceived: number;
  /** From Content-Length when present and valid. */
  contentLength: number | null;
  /** 0–1 when contentLength is known and > 0; otherwise null (indeterminate). */
  fraction: number | null;
}

/** Runner / multi-step progress for ETA. */
export interface IterationProgress {
  completed: number;
  total: number;
  elapsedMs: number;
}

export function parseContentLength(headers: Headers | Record<string, string>): number | null {
  const raw =
    headers instanceof Headers
      ? headers.get('content-length')
      : (headers['content-length'] ?? headers['Content-Length'] ?? null);
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function progressFraction(bytesReceived: number, contentLength: number | null): number | null {
  if (contentLength == null || contentLength <= 0) return null;
  return Math.min(1, Math.max(0, bytesReceived / contentLength));
}

/** ETA ms for download when Content-Length known and some bytes received. */
export function estimateDownloadEtaMs(
  bytesReceived: number,
  contentLength: number | null,
  elapsedMs: number,
): number | null {
  if (contentLength == null || contentLength <= 0 || bytesReceived <= 0 || elapsedMs <= 0) return null;
  if (bytesReceived >= contentLength) return 0;
  const rate = bytesReceived / elapsedMs;
  if (!(rate > 0)) return null;
  return Math.round((contentLength - bytesReceived) / rate);
}

/** ETA ms from completed iterations × avg duration × remaining. */
export function estimateIterationEtaMs(progress: IterationProgress): number | null {
  const { completed, total, elapsedMs } = progress;
  if (completed <= 0 || total <= 0 || elapsedMs <= 0) return null;
  const remaining = total - completed;
  if (remaining <= 0) return 0;
  const avg = elapsedMs / completed;
  return Math.round(avg * remaining);
}

export function formatDurationMs(ms: number): string {
  const n = Math.max(0, Math.round(ms));
  if (n < 1000) return `${n} ms`;
  const sec = n / 1000;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSendProgressLabel(p: SendProgress, etaMs: number | null): string {
  const elapsed = formatDurationMs(p.elapsedMs);
  if (p.phase === 'waiting') return `Waiting for response… ${elapsed} elapsed`;
  if (p.contentLength != null && p.fraction != null) {
    const eta = etaMs != null ? ` · ETA ${formatDurationMs(etaMs)}` : '';
    return `Downloading ${formatBytes(p.bytesReceived)} / ${formatBytes(p.contentLength)} · ${elapsed} elapsed${eta}`;
  }
  return `Downloading${p.bytesReceived > 0 ? ` ${formatBytes(p.bytesReceived)}` : ''}… ${elapsed} elapsed`;
}

export function formatRunnerProgressLabel(
  progress: IterationProgress,
  etaMs: number | null,
): string {
  const elapsed = formatDurationMs(progress.elapsedMs);
  const base = `Running ${progress.completed}/${progress.total} · ${elapsed} elapsed`;
  if (etaMs == null) return base;
  return `${base} · ETA ${formatDurationMs(etaMs)}`;
}
