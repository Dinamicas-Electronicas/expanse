/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { cookies } from 'next/headers';
import { ObjectId } from 'bson';
import { getDb } from './mongodb';
import { isShareActive, isShareProtected } from './sharePolicy';
import { createShareAccessToken, verifyShareAccessToken } from './shareAccess';

export type ShareAccessState = { status: 'ok' | 'locked' | 'missing' };

export function shareCookieName(shareId: string): string {
    return `share_access_${shareId}`;
}

/**
 * Tells the share page whether to render the canvas, a password form or a
 * "not found" state. This helper is intentionally NOT a Server Action: only
 * the status is returned and it must not be callable as a public endpoint.
 */
export async function getShareAccessState(shareId: string): Promise<ShareAccessState> {
    if (!/^[a-f0-9]{24}$/i.test(String(shareId))) return { status: 'missing' };

    const share = await (await getDb()).collection('shares').findOne({ _id: new ObjectId(shareId) });
    if (!share || !isShareActive(share as any)) return { status: 'missing' };
    if (!isShareProtected(share as any)) return { status: 'ok' };

    const token = (await cookies()).get(shareCookieName(shareId))?.value;
    if (token && verifyShareAccessToken(shareId, token)) return { status: 'ok' };

    return { status: 'locked' };
}

/** Stores the short-lived unlock token for exactly one share. */
export async function setShareAccessCookie(shareId: string): Promise<boolean> {
    const token = createShareAccessToken(shareId);
    if (!token) return false;

    (await cookies()).set(shareCookieName(shareId), token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: (process.env.URL || '').startsWith('https://'),
        maxAge: 60 * 60,
    });
    return true;
}
