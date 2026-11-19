"use server";

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import * as crypto from "node:crypto";

import { getDb } from "@/lib/mongodb";
import { redirect } from "next/navigation";
import { clientKey, rateLimit } from "@/lib/rateLimit";

export async function AuthWithGithub(cli: boolean) {
    const limit = rateLimit(await clientKey('oauth'), 20, 60 * 60 * 1000);
    if (!limit.ok) {
        throw new Error('Too many authentication attempts. Try again later.');
    }

    const db = await getDb();
    const CSRF_collection = db.collection('csrf_token')
    const randomString = crypto.randomBytes(32).toString('hex');
    await CSRF_collection.insertOne({
        token: randomString,
        createdAt: new Date().getTime()
    })
    const githubClientId = process.env.GITHUB_CLIENT_ID
    const redirectUri = process.env.URL + "/api/auth/external"
    if (!githubClientId) {
        throw new Error('GitHub OAuth is not configured');
    }
    const link = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&response_type=code&scope=read:user&redirect_uri=${redirectUri}${cli ? "/cli" : ""}&state=${randomString}`;
    redirect(link)
}
