/**
 * Serializes runs of `task`. A request made while a run is in flight queues exactly one follow-up
 * run (shared by every request made meanwhile), so bursts of storage changes cost at most two applies.
 */
export function createCoalescer(task: () => Promise<void>): () => Promise<void> {
  let current: Promise<void> | undefined;
  let queued: Promise<void> | undefined;

  const run = (): Promise<void> => {
    current = task().finally(() => {
      current = undefined;
    });
    return current;
  };

  return () => {
    if (queued) return queued;
    if (!current) return run();
    queued = current
      .catch(() => {})
      .then(() => {
        queued = undefined;
        return run();
      });
    return queued;
  };
}
