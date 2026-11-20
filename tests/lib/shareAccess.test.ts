/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createShareAccessToken, verifyShareAccessToken } from '@/lib/shareAccess';

afterEach(() => {
    delete process.env.SECRET_KEY;
});

describe('share access tokens', () => {
    it('accepts a fresh token for the same share', () => {
        process.env.SECRET_KEY = 'test-secret';
        const token = createShareAccessToken('6aff149ff3ec933fa297d864', 1_000);
        expect(token).toBeTruthy();
        expect(verifyShareAccessToken('6aff149ff3ec933fa297d864', token!, 2_000)).toBe(true);
    });

    it('rejects expired tokens and other shares', () => {
        process.env.SECRET_KEY = 'test-secret';
        const token = createShareAccessToken('6aff149ff3ec933fa297d864', 1_000, 1_000)!;
        expect(verifyShareAccessToken('6aff149ff3ec933fa297d864', token, 5_000)).toBe(false);
        expect(verifyShareAccessToken('5aff149ff3ec933fa297d865', token, 2_000)).toBe(false);
    });

    it('rejects tampered tokens and missing SECRET_KEY', () => {
        process.env.SECRET_KEY = 'test-secret';
        const token = createShareAccessToken('6aff149ff3ec933fa297d864', 1_000)!;
        expect(verifyShareAccessToken('6aff149ff3ec933fa297d864', `${token}x`, 2_000)).toBe(false);
        delete process.env.SECRET_KEY;
        expect(createShareAccessToken('6aff149ff3ec933fa297d864')).toBeNull();
        expect(verifyShareAccessToken('6aff149ff3ec933fa297d864', token, 2_000)).toBe(false);
    });
});
