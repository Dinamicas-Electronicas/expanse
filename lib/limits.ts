/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

function positiveFromEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Maximum projects per account (0/unset = 50). */
export function maxComposesPerUser(): number {
    return positiveFromEnv('MAX_COMPOSES_PER_USER', 50);
}

/** Maximum services in a single compose. */
export function maxServicesPerCompose(): number {
    return positiveFromEnv('MAX_SERVICES_PER_COMPOSE', 50);
}

/** Maximum YAML size accepted from the client (1 MB). */
export function maxComposeBytes(): number {
    return positiveFromEnv('MAX_COMPOSE_BYTES', 1_000_000);
}

/** Maximum base64 screenshot size processed per save (4 MB). */
export function maxScreenshotChars(): number {
    return positiveFromEnv('MAX_SCREENSHOT_CHARS', 4_000_000);
}
