/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getDb } from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import { emailSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { createSessionToken } from "@/lib/session";
import { ObjectId } from "bson";
import { decryptSecret, verifyTotp } from "@/lib/totp";

function parseBasicCredentials(header: string): { email: string; password: string } | null {
    const decoded = Buffer.from(header.substring(6), 'base64').toString('utf-8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;

    return {
        email: decoded.slice(0, separator),
        // Passwords may contain ':' — keep everything after the first one.
        password: decoded.slice(separator + 1),
    };
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
        return NextResponse.json({ error: "Missing or invalid Authorization header. Use Basic Authentication." }, { status: 401 })
    }

    const parsed = parseBasicCredentials(authHeader);
    if (!parsed || !parsed.password || !parsed.email) {
        return NextResponse.json({ error: "Invalid credentials format" }, { status: 400 })
    }

    const email = emailSchema.safeParse(parsed.email);
    if (!email.success) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const limit = rateLimit(`${await clientKey('api-jwt')}:${email.data}`, 10, 10 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { error: `Too many login attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
        );
    }

    const db = await getDb()
    const user = await db.collection("users").findOne({ email: email.data })

    if (!user?.password) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(parsed.password, user.password);
    if (!passwordMatch) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    if (user.mfaEnabled) {
        const otp = req.headers.get('x-otp') || new URL(req.url).searchParams.get('otp') || '';
        let secret = '';
        try {
            secret = decryptSecret(user.mfaSecret);
        } catch {
            return NextResponse.json({ error: "Invalid authentication code" }, { status: 401 });
        }
        if (!verifyTotp(secret, otp)) {
            return NextResponse.json({ error: "Invalid authentication code" }, { status: 401 });
        }
    }

    if (!process.env.SECRET_KEY) {
        console.error("SECRET_KEY is not configured");
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const token = await createSessionToken(
        user._id.toString(),
        user.email,
        Number(user.sessionVersion ?? 0),
    );
    return NextResponse.json({ token: token }, { status: 200 })
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token : '';
    if (token) {
        const secretKey = process.env.SECRET_KEY;
        if (!secretKey) {
            console.error("SECRET_KEY is not configured");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
        }

        const encodedSecretKey = new TextEncoder().encode(secretKey);
        try {
            const { payload } = await jwtVerify(token, encodedSecretKey);
            const userId = String(payload.userId ?? '');
            if (!/^[a-f0-9]{24}$/i.test(userId)) {
                return NextResponse.json({ error: "token is incorrect or outdated" }, { status: 403 });
            }
            const user = await (await getDb()).collection("users").findOne(
                { _id: new ObjectId(userId) },
                { projection: { sessionVersion: 1 } },
            );
            if (!user || Number(payload.v ?? 0) !== Number(user.sessionVersion ?? 0)) {
                return NextResponse.json({ error: "token is incorrect or outdated" }, { status: 403 });
            }
            return NextResponse.json({}, { status: 200 })
        } catch (e: any) {
            console.error(e)
            return NextResponse.json({ error: "token is incorrect or outdated" }, { status: 403 })
        }
    }
    return NextResponse.json({ error: "token is missing" }, { status: 400 })
}
