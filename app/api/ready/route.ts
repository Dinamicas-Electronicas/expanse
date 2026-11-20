/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import { runDocker } from '@/lib/dockerExec';

/**
 * Readiness probe: both MongoDB and the Docker daemon must respond.
 * Liveness stays on /api/ping. No internal error details are returned.
 */
export async function GET() {
    let mongo = false;
    let docker = false;

    try {
        const client = await getMongoClient();
        await client.db('admin').command({ ping: 1 });
        mongo = true;
    } catch {
        mongo = false;
    }

    try {
        await runDocker(['version', '--format', '{{.Server.Version}}'], { timeout: 5_000 });
        docker = true;
    } catch {
        docker = false;
    }

    return NextResponse.json(
        { status: mongo && docker ? 'ready' : 'degraded', mongo, docker },
        { status: mongo && docker ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
}
