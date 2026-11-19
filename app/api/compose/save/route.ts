/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { NextResponse } from 'next/server';
import { registerCompose } from '@/actions/userActions';
import { isValidObjectId } from '@/lib/validation';

const MAX_BODY_BYTES = 2_000_000;

/**
 * Keepalive save used by `navigator.sendBeacon` when the tab closes.
 * Authentication comes from the session cookie; the compose id is validated
 * and ownership is enforced by registerCompose.
 */
export async function POST(req: Request) {
    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body?.id || !isValidObjectId(body.id)) {
        return NextResponse.json({ error: 'Invalid compose id' }, { status: 400 });
    }
    if (!body.compose || typeof body.compose !== 'object') {
        return NextResponse.json({ error: 'Invalid compose data' }, { status: 400 });
    }

    try {
        const result = await registerCompose(
            body.compose,
            body.metadata ?? {},
            body.id,
            undefined,
            typeof body.expectedUpdatedAt === 'number' ? body.expectedUpdatedAt : undefined,
        );
        return NextResponse.json({ ok: true, updatedAt: result.updatedAt });
    } catch (error: any) {
        const message = String(error?.message ?? '');
        if (message === 'SAVE_CONFLICT') {
            return NextResponse.json({ error: 'SAVE_CONFLICT' }, { status: 409 });
        }
        if (message.includes('Not authenticated') || message.includes('Session expired')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Could not save' }, { status: 400 });
    }
}
