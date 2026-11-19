/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import axios from 'axios';

/**
 * Exchanges a GitHub OAuth code for an access token.
 *
 * Must stay outside `'use server'` modules: as a Server Action it would be
 * callable by anyone and would return the provider token to the caller.
 */
export async function exchangeGithubCode(code: string): Promise<string> {
    const res = await axios.get(
        "https://github.com/login/oauth/access_token",
        {
            params: {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            },
            headers: {
                "Accept": "application/json",
                "Accept-Encoding": "application/json",
            },
        }
    );
    return res.data.access_token;
}
