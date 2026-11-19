/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import crypto from 'node:crypto';

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function key(): Buffer | null {
    if (!process.env.SECRET_KEY) return null;
    return crypto.createHash('sha256').update(process.env.SECRET_KEY).digest();
}

function sign(payload: string): string | null {
    const secret = key();
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Creates a short-lived token that unlocks one password-protected share. */
export function createShareAccessToken(shareId: string, now = Date.now(), ttlMs = DEFAULT_TTL_MS): string | null {
    const expiresAt = now + ttlMs;
    const signature = sign(`${shareId}.${expiresAt}`);
    if (!signature) return null;
    return `${expiresAt}.${signature}`;
}

export function verifyShareAccessToken(shareId: string, token: string, now = Date.now()): boolean {
    const [expiresRaw, signature] = String(token ?? '').split('.');
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || expiresAt <= now || !signature) return false;

    const expected = sign(`${shareId}.${expiresAt}`);
    if (!expected || expected.length !== signature.length) return false;

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
