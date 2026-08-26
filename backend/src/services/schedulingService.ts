const HOUR_MS = 60 * 60 * 1000;

/**
 * Deterministic slot calculation for a batch of recipients.
 *
 * Each recipient gets index i (0-based). Within an hour "window" of size
 * hourlyLimit, sends are paced by delayMs from the window's own start.
 * Once a window would exceed hourlyLimit, the excess recipients are pushed
 * to the next hour boundary (windowIndex = floor(i / hourlyLimit)).
 *
 * This guarantees the hourly cap is respected purely from schedule-time
 * math, independent of however many workers later process the queue.
 */
export function computeScheduledTimes(params: {
  startTime: Date;
  delayMs: number;
  hourlyLimit: number;
  count: number;
}): Date[] {
  const { startTime, delayMs, hourlyLimit, count } = params;
  const safeHourlyLimit = Math.max(1, hourlyLimit);
  const start = startTime.getTime();

  const times: Date[] = [];
  for (let i = 0; i < count; i++) {
    const windowIndex = Math.floor(i / safeHourlyLimit);
    const indexInWindow = i % safeHourlyLimit;

    const naiveOffset = i * delayMs;
    const windowStartOffset = windowIndex * HOUR_MS;
    const withinWindowOffset = indexInWindow * delayMs;

    const offset = Math.max(naiveOffset, windowStartOffset + withinWindowOffset);
    times.push(new Date(start + offset));
  }
  return times;
}

export function nextHourWindowStart(from: Date): Date {
  const ms = from.getTime();
  return new Date(Math.ceil(ms / HOUR_MS) * HOUR_MS);
}
