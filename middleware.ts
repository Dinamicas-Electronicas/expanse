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
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

async function verifyToken(token: string | undefined, secretKey: string): Promise<boolean> {
    if (!token) return false;
    try {
        await jwtVerify(token, new TextEncoder().encode(secretKey));
        return true;
    } catch {
        return false;
    }
}

export async function middleware(req: NextRequest) {
    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
        console.error("SECRET_KEY environment variable is not configured.");
        // Do not redirect: redirecting to "/" would loop through this middleware.
        return new NextResponse("Server misconfigured: SECRET_KEY is not set", { status: 500 });
    }

    // 1. Handle locale routing first
    const intlResponse = intlMiddleware(req);

    // 2. Extract locale from pathname and reject unsupported prefixes.
    //    Without this check any first segment ("/fr/dashboard") was treated as
    //    a locale, bypassing the route matcher and the auth redirects.
    const { pathname } = req.nextUrl;
    const firstSegment = pathname.split('/').filter(Boolean)[0];

    if (!firstSegment) {
        return intlResponse;
    }

    if (!(routing.locales as readonly string[]).includes(firstSegment)) {
        const url = req.nextUrl.clone();
        url.pathname = `/${routing.defaultLocale}${pathname}`;
        return NextResponse.redirect(url);
    }

    const localeMatch = pathname.match(new RegExp(`^/(${routing.locales.join('|')})`));
    const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;

    // 3. Read token directly from the request cookies
    const rawToken = req.cookies.get("token")?.value;

    // 4. Protected routes: redirect to home if not authenticated
    const pathWithoutLocale = localeMatch ? pathname.slice(localeMatch[0].length) || '/' : pathname;

    if (
        pathWithoutLocale.startsWith("/dashboard") ||
        pathWithoutLocale.startsWith("/playground") ||
        pathWithoutLocale.startsWith("/deploy")
    ) {
        const valid = await verifyToken(rawToken, secretKey);
        if (!valid) {
            const response = NextResponse.redirect(new URL(`/${locale}`, req.url));
            response.cookies.delete("token");
            return response;
        }
    }

    // 5. Auth pages: redirect to dashboard if already authenticated
    if (
        (pathWithoutLocale.startsWith("/login") && !pathWithoutLocale.startsWith("/login/cli")) ||
        pathWithoutLocale.startsWith("/signin")
    ) {
        const valid = await verifyToken(rawToken, secretKey);
        if (valid) {
            return NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url));
        }
    }

    return intlResponse;
}

export const config = {
    // Everything except API routes, Next internals and static files.
    matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};