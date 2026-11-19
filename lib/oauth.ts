/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { getDb } from './mongodb';
import { createSessionToken, setSessionCookie } from './session';
import { createUserRecord } from './users';

export type OAuthProfile = {
    termsAccepted?: boolean;
    brevoId?: string | null;
    external: string;
    infos?: Record<string, unknown>;
};

/**
 * Session helper for identities already verified by an external provider
 * (GitHub OAuth). It lives outside the `'use server'` action modules on
 * purpose: exporting it from an action module would turn it into a publicly
 * callable endpoint and allow anyone to skip password verification.
 */
export async function loginOrRegisterOAuthUser(email: string, profile: OAuthProfile): Promise<string> {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        throw new Error('OAuth provider did not return a valid email');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const db = await getDb();
    const users = db.collection('users');

    const user = await users.findOne({ email: normalizedEmail });
    if (!user) {
        // OAuth is a signup path too: it must respect the installation switch.
        if (process.env.DISABLE_SIGNUP && process.env.DISABLE_SIGNUP.toLowerCase() !== 'false') {
            throw new Error('Signup is disabled');
        }

        const { id } = await createUserRecord({
            email: normalizedEmail,
            passwordHash: '',
            fields: {
                termsAccepted: profile.termsAccepted ?? true,
                brevoId: profile.brevoId ?? null,
                external: profile.external,
                infos: profile.infos ?? {},
            },
        });

        await setSessionCookie(await createSessionToken(id, normalizedEmail, 0));
        return id;
    }

    const userId = user._id.toString();
    await setSessionCookie(await createSessionToken(userId, normalizedEmail, Number(user.sessionVersion ?? 0)));
    return userId;
}
