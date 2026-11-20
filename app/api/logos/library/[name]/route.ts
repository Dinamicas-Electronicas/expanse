/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;

    // 'name' must be the normalized slug (e.g. 'mariadb'). Reject anything else
    // to keep the API from ever reading outside the logos directory.
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) {
        return new NextResponse('Not Found', { status: 404 });
    }

    const logosDir = path.resolve(process.cwd(), 'public/logos/library');

    const extensions = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'ico'];

    for (const ext of extensions) {
        const filePath = path.join(logosDir, `${name}.${ext}`);
        // Defense in depth: the resolved file must stay inside logosDir.
        if (!filePath.startsWith(`${logosDir}${path.sep}`)) {
            continue;
        }
        if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            const contentType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;

            return new NextResponse(fileBuffer, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
                },
            });
        }
    }

    // Final fallback: redirect to a generic placeholder or 404
    return new NextResponse('Not Found', { status: 404 });
}
