/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `SHARE_TTL_DAYS=0` means links never expire. Defaults to 30 days. */
export function shareTtlDays(): number {
    const value = Number(process.env.SHARE_TTL_DAYS);
    return Number.isFinite(value) && value >= 0 ? value : 30;
}

export function shareExpiresAt(now = Date.now()): number | null {
    const days = shareTtlDays();
    return days === 0 ? null : now + days * DAY_MS;
}

export function isShareActive(
    share: { access?: string | null; expiresAt?: number | null } | null | undefined,
    now = Date.now(),
): boolean {
    if (!share || share.access !== 'public') return false;
    if (typeof share.expiresAt === 'number' && share.expiresAt <= now) return false;
    return true;
}
