/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getGithubAccesToken } from "@/actions/github";
import axios from "axios";
import { loginOrRegisterOAuthUser } from "@/lib/oauth";
import { registerUserToBrevo } from "@/lib/brevo";

export async function GET(req: Request) {
    const state = new URL(req.url).searchParams.get("state")
    const code = new URL(req.url).searchParams.get("code")

    const db = await getDb();
    const CSRF_collection = db.collection('csrf_token')
    const token = await CSRF_collection.findOne({ token: state })
    if (!token || !code) {
        return NextResponse.json({ msg: "unauthorized" }, { status: 401 })
    }
    await CSRF_collection.deleteOne({ token: state })
    try {
        const ghToken = await getGithubAccesToken(code)
        const resp = await axios.get('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${ghToken}`
            }
        })
        if (!resp.data.email) {
            return NextResponse.json({ error: "Unable to sign in with GitHub: your account email is not accessible. Please make your GitHub email public and try again." }, { status: 406 })
        }
        const brevoId = await registerUserToBrevo({ email: resp.data.email })
        const user = {
            termsAccepted: true,
            brevoId: brevoId,
            external: "github",
            infos: {
                company: resp.data?.company,
                avatar_url: resp.data?.avatar_url,
                blog: resp.data?.blog,
                githubId: resp?.data?.id,
                location: resp?.data?.location,
                githubFollowers: resp?.data?.followers,
                notification_email: resp?.data?.notification_email
            }
        }
        // Verified provider identity: safe to create/login without a password.
        await loginOrRegisterOAuthUser(resp.data.email, user)
    } catch (e) {
        console.error("GitHub OAuth callback error:", e)
        return NextResponse.json({ error: "Authentication failed. Please try again." }, { status: 500 })
    }
    return NextResponse.redirect(new URL('/dashboard', req.url))
}
