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
import {
    decryptSecret,
    encryptSecret,
    generateTotp,
    generateTotpSecret,
    otpauthUrl,
    verifyTotp,
} from '@/lib/totp';

// RFC 6238 test secret for SHA-1 ("12345678901234567890").
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP', () => {
    it('matches the RFC 6238 SHA-1 vector (6 digits)', () => {
        // T = 59 s => counter 1 => 94287082 (8 digits) / 287082 (6 digits)
        expect(generateTotp(RFC_SECRET, 1)).toBe('287082');
    });

    it('generates unique base32 secrets', () => {
        const a = generateTotpSecret();
        const b = generateTotpSecret();
        expect(a).toMatch(/^[A-Z2-7]{32}$/);
        expect(a).not.toBe(b);
    });

    it('accepts the current code and rejects a wrong one', () => {
        const secret = generateTotpSecret();
        const counter = Math.floor(Date.now() / 30_000);
        expect(verifyTotp(secret, generateTotp(secret, counter))).toBe(true);
        expect(verifyTotp(secret, '000000')).toBe(false);
        expect(verifyTotp(secret, 'not-a-code')).toBe(false);
    });

    it('builds an otpauth URL', () => {
        const url = otpauthUrl('ABC234', 'user@example.com');
        expect(url).toContain('otpauth://totp/Expanse%3Auser%40example.com');
        expect(url).toContain('secret=ABC234');
        expect(url).toContain('issuer=Expanse');
    });

    it('encrypts and decrypts the secret with SECRET_KEY', () => {
        process.env.SECRET_KEY = 'test-secret-key';
        try {
            const secret = generateTotpSecret();
            const encrypted = encryptSecret(secret);
            expect(encrypted).not.toContain(secret);
            expect(decryptSecret(encrypted)).toBe(secret);
        } finally {
            delete process.env.SECRET_KEY;
        }
    });
});
