/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

export type ParsedPort = {
    hostPort: number;
    containerPort: number;
    ip?: string;
    protocol: string;
    raw: string;
};

/**
 * Parses the port forms Compose accepts:
 *   "8080:80"             → host 8080, container 80
 *   "127.0.0.1:8080:80"   → ip, host, container
 *   "8080:80/udp"         → protocol
 * Container-only ports ("80") are not published on the host, so they are not
 * candidates for reassignment. Ranges and IPv6 literals are skipped.
 */
export function parsePortEntry(entry: unknown): ParsedPort | null {
    const raw = String(entry ?? '').trim();
    if (!raw) return null;

    const [spec, protocol = 'tcp'] = raw.split('/');
    if (!spec || spec.startsWith('[')) return null;

    const parts = spec.split(':');
    if (parts.length !== 2 && parts.length !== 3) return null;

    const [maybeIp, hostRaw, containerRaw] = parts.length === 3
        ? parts
        : [undefined, parts[0], parts[1]];

    if (!/^\d+$/.test(hostRaw) || !/^\d+$/.test(containerRaw)) return null;

    const hostPort = Number(hostRaw);
    const containerPort = Number(containerRaw);
    if (hostPort < 1 || hostPort > 65_535) return null;
    if (containerPort < 1 || containerPort > 65_535) return null;

    return { hostPort, containerPort, ip: maybeIp, protocol, raw };
}

export function formatPort(hostPort: number, containerPort: number, ip?: string, protocol?: string): string {
    const base = ip ? `${ip}:${hostPort}:${containerPort}` : `${hostPort}:${containerPort}`;
    return protocol && protocol !== 'tcp' ? `${base}/${protocol}` : base;
}
