/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

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
    // Avoid trusting client-controlled forwarding headers unless the instance
    // is actually behind a reverse proxy. Set TRUST_PROXY=false when exposing
    // the app directly to reject spoofed X-Forwarded-For values.
    const trustProxy = (process.env.TRUST_PROXY || 'true').toLowerCase() !== 'false';
    const forwarded = trustProxy ? (h.get('x-forwarded-for') || '') : '';
    const realIp = trustProxy ? (h.get('x-real-ip') || '') : '';
    const ip = forwarded.split(',')[0].trim() || realIp || 'unknown';
    return `${scope}:${ip}`;
}

/** Test helper. */
export function resetRateLimits(): void {
    buckets.clear();
}

// Purge expired buckets so the in-memory store cannot grow without bound.
const purgeTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}, 60_000);
if (typeof purgeTimer.unref === 'function') purgeTimer.unref();
