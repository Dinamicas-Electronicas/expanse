/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

function base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

function base32Decode(input: string): Buffer {
    const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index < 0) continue;
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

/** Generates a random base32 secret (160 bits by default). */
export function generateTotpSecret(bytes = 20): string {
    return base32Encode(crypto.randomBytes(bytes));
}

export function generateTotp(
    secret: string,
    counter = Math.floor(Date.now() / (DEFAULT_STEP_SECONDS * 1000)),
    digits = DEFAULT_DIGITS,
): string {
    const key = base32Decode(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)
    ) % 10 ** digits;

    return String(code).padStart(digits, '0');
}

/** Verifies a 6-digit code with a ±1 step window by default. */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
    const code = String(token ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) return false;

    const counter = Math.floor(Date.now() / (DEFAULT_STEP_SECONDS * 1000));
    for (let offset = -window; offset <= window; offset += 1) {
        const expected = generateTotp(secret, counter + offset);
        if (
            expected.length === code.length &&
            crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))
        ) {
            return true;
        }
    }
    return false;
}

export function otpauthUrl(secret: string, email: string, issuer = 'Expanse'): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: String(DEFAULT_DIGITS),
        period: String(DEFAULT_STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}

function encryptionKey(): Buffer {
    // A dedicated key lets operators rotate SECRET_KEY without invalidating
    // existing TOTP secrets. Falls back to SECRET_KEY for single-key setups.
    const secret = process.env.MFA_ENCRYPTION_KEY || process.env.SECRET_KEY;
    if (!secret) throw new Error('MFA_ENCRYPTION_KEY/SECRET_KEY is not configured');
    return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypts the TOTP secret at rest (AES-256-GCM). */
export function encryptSecret(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
    const [ivPart, tagPart, dataPart] = String(payload ?? '').split('.');
    if (!ivPart || !tagPart || !dataPart) throw new Error('Invalid MFA secret');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
}
