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
import { isShareActive, isShareProtected, shareExpiresAt, shareTtlDays } from '@/lib/sharePolicy';

describe('share expiry policy', () => {
    it('creates a 30-day expiry by default', () => {
        delete process.env.SHARE_TTL_DAYS;
        const now = 1_000_000;
        expect(shareTtlDays()).toBe(30);
        expect(shareExpiresAt(now)).toBe(now + 30 * 24 * 60 * 60 * 1000);
    });

    it('supports permanent links with SHARE_TTL_DAYS=0', () => {
        process.env.SHARE_TTL_DAYS = '0';
        try {
            expect(shareExpiresAt()).toBeNull();
        } finally {
            delete process.env.SHARE_TTL_DAYS;
        }
    });

    it('rejects expired and non-public shares', () => {
        const now = 10_000;
        expect(isShareActive({ access: 'public', expiresAt: null }, now)).toBe(true);
        expect(isShareActive({ access: 'public', expiresAt: now + 1 }, now)).toBe(true);
        expect(isShareActive({ access: 'public', expiresAt: now }, now)).toBe(false);
        expect(isShareActive({ access: 'private', expiresAt: null }, now)).toBe(false);
    });

    it('detects password-protected shares', () => {
        expect(isShareProtected({ passwordHash: 'hash' })).toBe(true);
        expect(isShareProtected({ passwordHash: null })).toBe(false);
        expect(isShareProtected({})).toBe(false);
    });
});
