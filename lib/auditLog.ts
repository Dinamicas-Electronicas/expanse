/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { ObjectId } from 'bson';
import { getDb } from './mongodb';

export type AuditEvent = {
    userId?: string | ObjectId | null;
    action: string;
    resource?: string | null;
    result?: 'success' | 'failure';
    metadata?: Record<string, unknown> | null;
};

/**
 * Append-only audit trail for sensitive operations.
 *
 * Failures are logged to stderr but never propagated: an audit write must not
 * break login, deploys or account deletion. Secrets must never be included in
 * `metadata` (only ids, names and outcomes).
 */
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
    try {
        const userId = event.userId
            ? (typeof event.userId === 'string' ? new ObjectId(event.userId) : event.userId)
            : null;

        await (await getDb()).collection('audit_log').insertOne({
            userId,
            action: String(event.action).slice(0, 80),
            resource: event.resource ? String(event.resource).slice(0, 200) : null,
            result: event.result ?? 'success',
            metadata: event.metadata ?? null,
            createdAt: new Date(),
        });
    } catch (error) {
        console.error('[audit] Could not record event:', error);
    }
}
