/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { cookies } from "next/headers";
import { jwtVerify, type JWTPayload } from "jose";
import { ObjectId } from "bson";
import { getDb } from "./mongodb";

/**
 * Verifies a JWT, its expiry and the `sessionVersion` stored in MongoDB.
 * A password reset (or "logout everywhere") bumps the version and invalidates
 * every previously issued token.
 */
export async function verifySessionToken(rawToken: string): Promise<JWTPayload> {
    if (!process.env.SECRET_KEY) {
        throw new Error("SECRET_KEY environment variable is not configured.");
    }

    const secretKey = new TextEncoder().encode(process.env.SECRET_KEY);
    const { payload } = await jwtVerify(rawToken, secretKey);

    const userId = String(payload.userId ?? "");
    if (!/^[a-f0-9]{24}$/i.test(userId)) {
        throw new Error("Not authenticated: invalid session token.");
    }

    const user = await (await getDb())
        .collection("users")
        .findOne({ _id: new ObjectId(userId) }, { projection: { sessionVersion: 1 } });

    if (!user) {
        throw new Error("Not authenticated: user no longer exists.");
    }

    const tokenVersion = Number(payload.v ?? 0);
    const currentVersion = Number(user.sessionVersion ?? 0);
    if (tokenVersion !== currentVersion) {
        throw new Error("Session expired: please sign in again.");
    }

    return payload;
}

export async function ensureAuth() {
    // Skip real auth check during Next.js build. The check is tied to the
    // lifecycle event, not to a user-controlled header.
    if (process.env.npm_lifecycle_event === 'build') {
        return { userId: "build-mode", email: "build@local", v: 0 };
    }

    const rawToken = (await cookies()).get("token")?.value;
    if (!rawToken) {
        throw new Error("Not authenticated: missing session token.");
    }

    return verifySessionToken(rawToken);
}
