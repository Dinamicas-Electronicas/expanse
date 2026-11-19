/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { ObjectId } from 'bson';
import { ensureAuth } from './auth';
import { assertComposeId } from './dockerExec';
import { getDb } from './mongodb';

export type UserRole = 'admin' | 'user';

export type Session = {
    userId: ObjectId;
    email: string;
    role: UserRole;
    buildMode?: boolean;
};

export class ActionError extends Error {
    code: string;

    constructor(code: string, message?: string) {
        super(message ?? code);
        this.name = 'ActionError';
        this.code = code;
    }
}

const BUILD_USER_ID = new ObjectId('000000000000000000000000');

/**
 * Loads the authenticated user from MongoDB.
 *
 * `ensureAuth()` validates the JWT (signature, expiry and session version);
 * this helper adds the current role, which is the source of truth for RBAC.
 * Roles are never read from the token so a demotion takes effect immediately.
 */
export async function requireUser(): Promise<Session> {
    const payload = await ensureAuth();
    if (payload.userId === 'build-mode') {
        return { userId: BUILD_USER_ID, email: 'build@local', role: 'admin', buildMode: true };
    }

    const userId = new ObjectId(String(payload.userId));
    const user = await (await getDb())
        .collection('users')
        .findOne({ _id: userId }, { projection: { email: 1, role: 1 } });

    if (!user) {
        throw new ActionError('UNAUTHENTICATED', 'Session is no longer valid');
    }

    return {
        userId,
        email: String(user.email ?? ''),
        role: user.role === 'admin' ? 'admin' : 'user',
    };
}

export async function requireAdmin(): Promise<Session> {
    const session = await requireUser();
    if (session.role !== 'admin') {
        throw new ActionError('FORBIDDEN', 'This operation requires an administrator');
    }
    return session;
}

/**
 * Loads a compose only if it belongs to the session user. The error is the
 * same for "not found" and "not yours" so the id cannot be used to enumerate.
 */
export async function requireCompose(composeId: string, session?: Session) {
    const current = session ?? (await requireUser());
    const id = assertComposeId(composeId);

    const doc = await (await getDb())
        .collection('composes')
        .findOne({ _id: new ObjectId(id), userId: current.userId });

    if (!doc) {
        throw new ActionError('COMPOSE_NOT_FOUND', 'Compose not found');
    }

    return doc;
}

/** Host-wide projects are only manageable by admins or with an explicit opt-in. */
export function assertManagedProject(projectName: string): string {
    const project = String(projectName ?? '').trim();
    if (project.startsWith('expanse-project_')) return project;
    if (process.env.ALLOW_HOST_PROJECT_OPS === 'true') return project;
    throw new ActionError('FORBIDDEN_HOST_PROJECT', 'Only Expanse projects can be managed');
}
