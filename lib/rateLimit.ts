import { headers } from 'next/headers';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
    ok: boolean;
    remaining: number;
    retryAfterSeconds: number;
};

/**
 * Small in-process fixed-window limiter for authentication endpoints.
 *
 * It is intentionally dependency-free and best-effort: it protects a single
 * Node process (the default standalone deployment). For multi-replica
 * deployments it should be replaced by a shared store (Redis) — see SDD.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }

    existing.count += 1;
    const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);

    if (existing.count > limit) {
        return { ok: false, remaining: 0, retryAfterSeconds };
    }

    return { ok: true, remaining: limit - existing.count, retryAfterSeconds };
}

/** Best-effort client IP for rate-limit keys (proxy aware). */
export async function clientKey(scope: string): Promise<string> {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for') || '';
    const ip = forwarded.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
    return `${scope}:${ip}`;
}

/** Test helper. */
export function resetRateLimits(): void {
    buckets.clear();
}
