import { redisConnection } from "../config/redis";
import { env } from "../config/env";

const HOUR_SECONDS = 3600;

function hourBucketKey(senderId: string, date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `email-rate:${senderId}:${y}-${m}-${d}-${h}`;
}

/**
 * Atomically increments the sender's per-hour counter and reports whether
 * this send is within the configured limit. Uses a Lua script so the
 * INCR + limit check + EXPIRE happen as a single atomic operation, which
 * is safe across any number of concurrent workers/instances.
 */
const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
if current > tonumber(ARGV[1]) then
  redis.call("DECR", KEYS[1])
  return 0
end
return 1
`;

export async function tryConsumeHourlySlot(
  senderId: string,
  hourlyLimit: number,
  now: Date = new Date()
): Promise<boolean> {
  const key = hourBucketKey(senderId, now);
  const result = await redisConnection.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    hourlyLimit,
    HOUR_SECONDS
  );
  return result === 1;
}

/**
 * Enforces the minimum delay between sends for a given sender across all
 * concurrent workers using an atomic SET NX PX lock. If the lock cannot be
 * acquired, the caller should back off / reschedule rather than send.
 */
export async function tryAcquireSendSlot(senderId: string): Promise<boolean> {
  const key = `email-rate:last-sent:${senderId}`;
  const result = await redisConnection.set(
    key,
    Date.now().toString(),
    "PX",
    env.minDelayMs,
    "NX"
  );
  return result === "OK";
}
