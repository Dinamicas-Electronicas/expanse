/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

export type CompiledImageRef = {
    name: string;
    tag: string;
    digest?: string;
};

/**
 * Parses a Docker image reference without breaking on registry ports
 * (`registry:5000/app`) or digests (`app@sha256:...`).
 */
export function parseImageRef(reference: string): CompiledImageRef {
    const ref = String(reference ?? '').trim();
    if (!ref) return { name: '', tag: 'latest' };

    const digestIndex = ref.indexOf('@');
    const withoutDigest = digestIndex >= 0 ? ref.slice(0, digestIndex) : ref;
    const digest = digestIndex >= 0 ? ref.slice(digestIndex + 1) : undefined;

    const lastSlash = withoutDigest.lastIndexOf('/');
    const lastColon = withoutDigest.lastIndexOf(':');

    // A colon before the last slash belongs to a registry port.
    if (lastColon > lastSlash) {
        return {
            name: withoutDigest.slice(0, lastColon),
            tag: withoutDigest.slice(lastColon + 1) || 'latest',
            digest,
        };
    }

    return { name: withoutDigest, tag: 'latest', digest };
}
