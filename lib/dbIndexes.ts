import { getDb } from './mongodb';

let indexesReady: Promise<void> | null = null;

/**
 * Creates the indexes the application relies on.
 *
 * Without these, MongoDB only has the `_id` index: user lookups scan the whole
 * collection, duplicate emails are possible under concurrent signups, and the
 * `reset_code`/`csrf_token` collections grow forever.
 *
 * Failures are logged but never block startup (e.g. a unique index cannot be
 * created while legacy duplicates exist).
 */
export function ensureIndexes(): Promise<void> {
    if (indexesReady) return indexesReady;

    indexesReady = (async () => {
        const db = await getDb();

        const tasks: Array<[string, Promise<unknown>]> = [
            ['users.email (unique)', db.collection('users').createIndex({ email: 1 }, { unique: true })],
            ['composes.userId', db.collection('composes').createIndex({ userId: 1, updatedAt: -1 })],
            ['shares.userId', db.collection('shares').createIndex({ userId: 1 })],
            ['shares.composeId', db.collection('shares').createIndex({ composeId: 1 })],
            ['reset_code.code (unique)', db.collection('reset_code').createIndex({ code: 1 }, { unique: true })],
            ['reset_code.createdAt (ttl 1d)', db.collection('reset_code').createIndex({ createdAt: 1 }, { expireAfterSeconds: 86_400 })],
            ['csrf_token.createdAt (ttl 1h)', db.collection('csrf_token').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3_600 })],
        ];

        const results = await Promise.allSettled(tasks.map(([, promise]) => promise));
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`[db] Could not create index ${tasks[index][0]}:`, result.reason?.message ?? result.reason);
            }
        });
    })().catch((error) => {
        console.error('[db] Index bootstrap failed:', error);
        // Allow a later call to retry (e.g. transient DB outage at startup).
        indexesReady = null;
    });

    return indexesReady;
}
