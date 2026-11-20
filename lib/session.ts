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
import { SignJWT } from 'jose';

/** 30-day session used consistently for JWT payload and cookie expiry. */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_DURATION_STR = '30d';

export type SessionCookie = {
    name: string;
    value: string;
    httpOnly: boolean;
    path: string;
    sameSite: 'lax' | 'strict' | 'none';
    secure: boolean;
    expires: Date;
};

/**
 * Builds the session cookie with explicit security attributes.
 *
 * `Secure` is only enabled when the configured public URL uses HTTPS: forcing
 * it on a plain-HTTP deployment (the default `http://localhost:4000`) would
 * make the cookie undeliverable and break login.
 */
export function buildSessionCookie(token: string, now = Date.now()): SessionCookie {
    const publicUrl = process.env.URL || '';
    return {
        name: 'token',
        value: token,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: publicUrl.startsWith('https://'),
        expires: new Date(now + SESSION_DURATION_MS),
    };
}

export async function createSessionToken(userId: string, email: string, sessionVersion = 0): Promise<string> {
    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
        throw new Error('Server configuration error: SECRET_KEY is not set.');
    }

    return new SignJWT({ userId, email, v: Number(sessionVersion) || 0 })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(SESSION_DURATION_STR)
        .sign(new TextEncoder().encode(secretKey));
}

export async function setSessionCookie(token: string): Promise<void> {
    (await cookies()).set(buildSessionCookie(token));
}
