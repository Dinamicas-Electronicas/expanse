/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { describe, expect, it } from 'vitest';
import { formatPort, parsePortEntry } from '@/lib/ports';

describe('parsePortEntry', () => {
    it('parses host:container', () => {
        expect(parsePortEntry('8080:80')).toMatchObject({
            hostPort: 8080,
            containerPort: 80,
            protocol: 'tcp',
        });
    });

    it('parses an IP, host and container', () => {
        expect(parsePortEntry('127.0.0.1:8080:80')).toMatchObject({
            ip: '127.0.0.1',
            hostPort: 8080,
            containerPort: 80,
        });
    });

    it('keeps the protocol', () => {
        expect(parsePortEntry('53:53/udp')?.protocol).toBe('udp');
    });

    it('ignores container-only ports and ranges', () => {
        expect(parsePortEntry('80')).toBeNull();
        expect(parsePortEntry('8000-8005:8000-8005')).toBeNull();
    });

    it('ignores invalid and IPv6 entries', () => {
        expect(parsePortEntry('abc:80')).toBeNull();
        expect(parsePortEntry('[::1]:8080:80')).toBeNull();
        expect(parsePortEntry('99999:80')).toBeNull();
    });
});

describe('formatPort', () => {
    it('round-trips the supported forms', () => {
        expect(formatPort(8080, 80)).toBe('8080:80');
        expect(formatPort(8080, 80, '127.0.0.1')).toBe('127.0.0.1:8080:80');
        expect(formatPort(53, 53, undefined, 'udp')).toBe('53:53/udp');
    });
});
