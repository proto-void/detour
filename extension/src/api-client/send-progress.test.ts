import { describe, expect, it } from 'vitest';
import {
  estimateDownloadEtaMs,
  estimateIterationEtaMs,
  formatDurationMs,
  formatRunnerProgressLabel,
  formatSendProgressLabel,
  parseContentLength,
  progressFraction,
} from './send-progress';

describe('send-progress', () => {
  it('parses Content-Length from Headers and plain maps', () => {
    expect(parseContentLength(new Headers({ 'Content-Length': '1200' }))).toBe(1200);
    expect(parseContentLength({ 'content-length': '40' })).toBe(40);
    expect(parseContentLength({})).toBeNull();
    expect(parseContentLength({ 'content-length': 'nope' })).toBeNull();
  });

  it('computes fraction only when length is known', () => {
    expect(progressFraction(50, 100)).toBe(0.5);
    expect(progressFraction(0, null)).toBeNull();
    expect(progressFraction(10, 0)).toBeNull();
  });

  it('estimates download ETA from throughput', () => {
    expect(estimateDownloadEtaMs(100, 200, 1000)).toBe(1000);
    expect(estimateDownloadEtaMs(0, 200, 1000)).toBeNull();
    expect(estimateDownloadEtaMs(50, null, 1000)).toBeNull();
  });

  it('estimates runner ETA from avg iteration duration', () => {
    expect(estimateIterationEtaMs({ completed: 2, total: 5, elapsedMs: 1000 })).toBe(1500);
    expect(estimateIterationEtaMs({ completed: 0, total: 5, elapsedMs: 100 })).toBeNull();
    expect(estimateIterationEtaMs({ completed: 5, total: 5, elapsedMs: 1000 })).toBe(0);
  });

  it('formats labels without inventing ETA when unknown', () => {
    expect(formatDurationMs(450)).toBe('450 ms');
    expect(
      formatSendProgressLabel(
        { phase: 'waiting', elapsedMs: 200, bytesReceived: 0, contentLength: null, fraction: null },
        null,
      ),
    ).toMatch(/Waiting.*200 ms elapsed/);
    expect(
      formatSendProgressLabel(
        { phase: 'downloading', elapsedMs: 500, bytesReceived: 50, contentLength: null, fraction: null },
        null,
      ),
    ).toMatch(/Downloading 50 B.*500 ms elapsed/);
    expect(formatSendProgressLabel(
      { phase: 'downloading', elapsedMs: 1000, bytesReceived: 100, contentLength: 200, fraction: 0.5 },
      1000,
    )).toMatch(/ETA 1\.0 s/);
    expect(formatRunnerProgressLabel({ completed: 1, total: 4, elapsedMs: 2000 }, 6000)).toMatch(
      /1\/4.*ETA/,
    );
  });
});
