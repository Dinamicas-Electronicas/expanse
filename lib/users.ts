/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { getDb } from './mongodb';

export type CreateUserInput = {
    email: string;
    passwordHash: string;
    fields?: Record<string, unknown>;
};

/**
 * Atomically claims the first administrator slot.
 *
 * A `settings` document acts as a lock: the process that inserts it is the
 * first one, everyone else gets the existing document. This removes the
 * `countDocuments() === 0` race where two concurrent signups both became admin.
 */
async function claimInitialAdmin(): Promise<'admin' | 'user'> {
    const settings = (await getDb()).collection('settings');

    try {
        const result = await settings.updateOne(
            { _id: 'bootstrap' as unknown as never },
            { $setOnInsert: { adminClaimedAt: Date.now() } },
            { upsert: true },
        );
        return result.upsertedCount === 1 ? 'admin' : 'user';
    } catch (error: any) {
        // Another concurrent request claimed the slot first.
        if (error?.code === 11000) return 'user';
        console.error('[users] Could not claim the admin slot:', error);
        return 'user';
    }
}

/** Creates a user document. Callers are responsible for validating the input. */
export async function createUserRecord(input: CreateUserInput) {
    const users = (await getDb()).collection('users');
    const role = await claimInitialAdmin();

    try {
        const result = await users.insertOne({
            email: input.email,
            password: input.passwordHash,
            ...(input.fields ?? {}),
            role,
            sessionVersion: 0,
            createdAt: Date.now(),
        });
        return { id: result.insertedId.toString(), role };
    } catch (error: any) {
        if (error?.code === 11000) {
            throw new Error('An account with this email already exists');
        }
        throw error;
    }
}

/**
 * Makes sure legacy installations have at least one administrator.
 * Idempotent; called by the index bootstrap at startup.
 */
export async function ensureAdminExists(): Promise<void> {
    const users = (await getDb()).collection('users');
    const admin = await users.findOne({ role: 'admin' }, { projection: { _id: 1 } });
    if (admin) return;

    const oldest = await users.find({}, { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(1).next();
    if (!oldest) return;

    await users.updateOne({ _id: oldest._id }, { $set: { role: 'admin' } });
}
