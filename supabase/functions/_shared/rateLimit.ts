/**
 * Rate limit distribuído (Upstash Redis REST) com fallback em memória por instância.
 *
 * Secrets (opcional — sem eles usa fallback local):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

const memory = new Map<string, { n: number; resetAt: number }>();

function memoryCheck(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now > entry.resetAt) {
    memory.set(key, { n: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.n >= limit) return false;
  entry.n++;
  return true;
}

function upstashConfigured(): boolean {
  return !!(
    Deno.env.get("UPSTASH_REDIS_REST_URL")?.trim() &&
    Deno.env.get("UPSTASH_REDIS_REST_TOKEN")?.trim()
  );
}

async function upstashCommand(command: (string | number)[]): Promise<unknown> {
  const base = Deno.env.get("UPSTASH_REDIS_REST_URL")!.trim().replace(/\/$/, "");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!.trim();
  const res = await fetch(base, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`upstash_http_${res.status}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(String(body.error));
  }
  return body.result;
}

async function redisCheck(key: string, limit: number, windowSec: number): Promise<boolean> {
  const redisKey = `rl:ov:${key}`;
  const count = Number(await upstashCommand(["INCR", redisKey]));
  if (count === 1) {
    await upstashCommand(["EXPIRE", redisKey, windowSec]);
  }
  return count <= limit;
}

/** Retorna true se a requisição pode prosseguir. */
export async function checkRateLimit(
  scope: string,
  req: Request,
  limit: number,
  windowSec = 60,
): Promise<boolean> {
  const ip = (
    req.headers.get("x-forwarded-for") ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  )
    .split(",")[0]
    .trim();
  const key = `${scope}:${ip}`;

  if (upstashConfigured()) {
    try {
      return await redisCheck(key, limit, windowSec);
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "rate_limit_redis_fallback",
          scope,
          error: String(err),
        }),
      );
    }
  }

  return memoryCheck(key, limit, windowSec * 1000);
}
