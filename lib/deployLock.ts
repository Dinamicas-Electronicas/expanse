/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './mongodb';

const COLLECTION = 'deploy_locks';
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Acquires a per-compose deployment lock shared by every app replica.
 *
 * MongoDB's unique `_id` makes the upsert atomic: if a live lock exists the
 * filter does not match and the upsert hits a duplicate key, which means
 * "another deployment is in progress". Expired locks are taken over.
 *
 * Returns a unique owner token, or null when the lock is busy.
 */
export async function acquireDeployLock(
    composeId: string,
    ttlMs: number = DEFAULT_TTL_MS,
): Promise<string | null> {
    const db = await getDb();
    const locks = db.collection(COLLECTION);
    const now = Date.now();
    const owner = randomUUID();

    try {
        await locks.findOneAndUpdate(
            {
                _id: composeId as unknown as never,
                $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }],
            },
            { $set: { owner, expiresAt: now + ttlMs, acquiredAt: now } },
            { upsert: true, returnDocument: 'after' },
        );
        return owner;
    } catch (error: any) {
        // Duplicate _id means a live lock already exists.
        if (error?.code === 11000) return null;
        throw error;
    }
}

/** Releases a lock only if this process still owns it. */
export async function releaseDeployLock(composeId: string, owner: string): Promise<void> {
    try {
        await (await getDb()).collection(COLLECTION).deleteOne({ _id: composeId as unknown as never, owner });
    } catch (error) {
        // A stale lock expires on its own; release must never mask the deploy result.
        console.error('[deployLock] Could not release lock:', error);
    }
}
