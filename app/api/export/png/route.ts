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
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'bson';
import { isShareActive, isShareProtected } from '@/lib/sharePolicy';
import { verifyShareAccessToken } from '@/lib/shareAccess';
import { shareCookieName } from '@/lib/shareGate';

export async function GET(request: NextRequest) {
    try {
        const shareId = request.nextUrl.searchParams.get('shareId');

        if (!shareId) {
            return NextResponse.json({ error: 'Share ID is required' }, { status: 400 });
        }

        if (!/^[a-f0-9]{24}$/i.test(shareId)) {
            return NextResponse.json({ error: 'Invalid share ID' }, { status: 400 });
        }

        // Use the application database (DB_NAME) instead of a hardcoded name.
        const db = await getDb();
        const sharesCollection = db.collection('shares');

        const share = await sharesCollection.findOne({ _id: new ObjectId(shareId) });

        if (!share) {
            return NextResponse.json({ error: 'Share not found' }, { status: 404 });
        }

        // Only explicitly public, non-expired shares can be exported.
        if (!isShareActive(share as any)) {
            return NextResponse.json({ error: 'Share is not public or has expired' }, { status: 403 });
        }

        // Password-protected shares require the unlock cookie or a signed key.
        if (isShareProtected(share as any)) {
            const token = request.nextUrl.searchParams.get('key')
                || request.cookies.get(shareCookieName(shareId))?.value
                || '';
            if (!verifyShareAccessToken(shareId, token)) {
                return NextResponse.json({ error: 'Share is password protected' }, { status: 403 });
            }
        }

        const composeId = share.composeId;
        const collection = db.collection('composes');

        const compose = await collection.findOne({ _id: new ObjectId(composeId) });

        if (!compose) {
            return NextResponse.json({ error: 'Compose not found' }, { status: 404 });
        }

        const dataString = JSON.stringify(compose.data) + JSON.stringify(compose.metadata);
        const checksum = createHash('sha256').update(dataString).digest('hex').substring(0, 16);
        const filename = `playground-${checksum}.png`;
        const filepath = path.join(process.cwd(), 'public', 'exports', filename);

        // Only serve files produced by this app (checksum-based name).
        let fileBuffer: Buffer;
        try {
            fileBuffer = await fs.readFile(filepath);
        } catch {
            return NextResponse.json(
                { error: 'Thumbnail not available. Please save the project in the playground to generate it.' },
                { status: 404 }
            );
        }

        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: {
                'Content-Type': 'image/png',
                'Content-Disposition': `inline; filename="${filename}"`,
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        console.error('Error exporting playground as PNG via API:', error);
        return NextResponse.json({ error: 'Failed to export playground' }, { status: 500 });
    }
}
