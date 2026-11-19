import { getDb } from './mongodb';
import { createSessionToken, setSessionCookie } from './session';

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

    const db = await getDb();
    const users = db.collection('users');

    let user = await users.findOne({ email });
    if (!user) {
        const isFirstUser = (await users.countDocuments()) === 0;
        const result = await users.insertOne({
            email,
            ...profile,
            role: isFirstUser ? 'admin' : 'user',
            createdAt: Date.now(),
        });
        user = { ...profile, email, _id: result.insertedId, role: isFirstUser ? 'admin' : 'user' };
    }

    const userId = user._id.toString();
    await setSessionCookie(await createSessionToken(userId, email));
    return userId;
}
