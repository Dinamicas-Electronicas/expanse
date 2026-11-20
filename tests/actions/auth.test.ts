/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { encryptSecret, generateTotp, generateTotpSecret } from '@/lib/totp';

const mocks = vi.hoisted(() => {
    const state: { user: any } = { user: null };
    return {
        state,
        findOne: vi.fn(async () => state.user),
        insertOne: vi.fn(async (_doc: Record<string, any>) => ({ insertedId: { toString: () => '6aff14b3f3ec933fa297d865' } })),
        countDocuments: vi.fn(async () => 1),
        findOneAndUpdate: vi.fn(async () => null),
        updateOne: vi.fn(async () => ({ upsertedCount: 1 })),
        createSessionToken: vi.fn(async () => 'signed-token'),
        setSessionCookie: vi.fn(async () => undefined),
    };
});

vi.mock('@/lib/mongodb', () => ({
    getDb: vi.fn(async () => ({
        collection: () => ({
            findOne: mocks.findOne,
            insertOne: mocks.insertOne,
            countDocuments: mocks.countDocuments,
            findOneAndUpdate: mocks.findOneAndUpdate,
            updateOne: mocks.updateOne,
        }),
    })),
}));

vi.mock('@/lib/rateLimit', () => ({
    rateLimit: vi.fn(() => ({ ok: true, remaining: 10, retryAfterSeconds: 0 })),
    clientKey: vi.fn(async () => 'test-client'),
    resetRateLimits: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
    createSessionToken: mocks.createSessionToken,
    setSessionCookie: mocks.setSessionCookie,
}));

vi.mock('@/lib/brevo', () => ({
    registerUserToBrevo: vi.fn(async () => null),
    sendRecoverPassdEmail: vi.fn(async () => null),
    updateUserList: vi.fn(async () => undefined),
}));

vi.mock('@/app/actions/exportActions', () => ({
    processAndSaveClientExport: vi.fn(async () => Buffer.from('')),
}));

import { createOrLoginUser, registerUser } from '@/actions/userActions';

describe('createOrLoginUser (password authentication only)', () => {
    beforeEach(() => {
        process.env.SECRET_KEY = 'test-secret';
        mocks.state.user = null;
        mocks.insertOne.mockClear();
        mocks.setSessionCookie.mockClear();
    });

    it('rejects an OAuth-style payload for an existing account (no password bypass)', async () => {
        mocks.state.user = {
            _id: '6aff149ff3ec933fa297d864',
            email: 'victim@example.com',
            password: await bcrypt.hash('real-password', 4),
        };

        await expect(
            createOrLoginUser('victim@example.com', { external: 'github', password: 'wrong-password' }),
        ).rejects.toThrow('Invalid email or password');
        expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    });

    it('rejects an external flag with no password at all', async () => {
        mocks.state.user = {
            _id: '6aff149ff3ec933fa297d864',
            email: 'victim@example.com',
            password: await bcrypt.hash('real-password', 4),
        };

        await expect(
            createOrLoginUser('victim@example.com', { external: 'github' }),
        ).rejects.toThrow('Invalid email or password');
        expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    });

    it('signs in when the password matches', async () => {
        mocks.state.user = {
            _id: '6aff149ff3ec933fa297d864',
            email: 'user@example.com',
            password: await bcrypt.hash('real-password', 4),
        };

        await expect(createOrLoginUser('user@example.com', { password: 'real-password' }))
            .resolves.toBe('6aff149ff3ec933fa297d864');
        expect(mocks.setSessionCookie).toHaveBeenCalledWith('signed-token');
    });

    it('does not create accounts from the login helper', async () => {
        await expect(
            createOrLoginUser('new@example.com', { password: 'a-strong-password' }),
        ).rejects.toThrow('Invalid email or password');
        expect(mocks.insertOne).not.toHaveBeenCalled();
        expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    });

    it('requires a password for new accounts', async () => {
        await expect(createOrLoginUser('new@example.com', { external: 'github' }))
            .rejects.toThrow('Invalid email or password');
        expect(mocks.insertOne).not.toHaveBeenCalled();
    });

    it('rejects registration when signup is disabled', async () => {
        process.env.DISABLE_SIGNUP = 'true';
        try {
            const result = await registerUser('new@example.com', 'a-strong-password', '', true, '{}');
            expect(result.ok).toBe(false);
            expect(mocks.insertOne).not.toHaveBeenCalled();
        } finally {
            delete process.env.DISABLE_SIGNUP;
        }
    });

    it('creates accounts only through the validated registration path', async () => {
        const result = await registerUser('new@example.com', 'a-strong-password', 'Acme', true, '{}');
        expect(result.ok).toBe(true);
        const inserted = mocks.insertOne.mock.calls[0][0];
        expect(inserted.email).toBe('new@example.com');
        expect(inserted.termsAccepted).toBe(true);
        expect(await bcrypt.compare('a-strong-password', inserted.password)).toBe(true);
        // updateOne reported an upsert => this was the first account.
        expect(inserted.role).toBe('admin');
        expect(mocks.setSessionCookie).toHaveBeenCalledWith('signed-token');
    });

    it('rejects invalid emails through schema validation', async () => {
        await expect(createOrLoginUser('not-an-email', { password: 'whatever' }))
            .rejects.toBeTruthy();
    });

    it('requires a valid TOTP code when MFA is enabled', async () => {
        const secret = generateTotpSecret();
        mocks.state.user = {
            _id: '6aff149ff3ec933fa297d864',
            email: 'mfa@example.com',
            password: await bcrypt.hash('real-password', 4),
            mfaEnabled: true,
            mfaSecret: encryptSecret(secret),
        };

        await expect(
            createOrLoginUser('mfa@example.com', { password: 'real-password' }),
        ).rejects.toThrow('Invalid authentication code');

        const code = generateTotp(secret);
        await expect(
            createOrLoginUser('mfa@example.com', { password: 'real-password', otp: code }),
        ).resolves.toBe('6aff149ff3ec933fa297d864');
    });
});
