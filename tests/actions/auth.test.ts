import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const mocks = vi.hoisted(() => {
    const state: { user: any } = { user: null };
    return {
        state,
        findOne: vi.fn(async () => state.user),
        insertOne: vi.fn(async (_doc: Record<string, any>) => ({ insertedId: { toString: () => '6aff14b3f3ec933fa297d865' } })),
        countDocuments: vi.fn(async () => 1),
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
        }),
    })),
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

import { createOrLoginUser } from '@/actions/userActions';

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

    it('creates new accounts without persisting the external flag', async () => {
        await expect(
            createOrLoginUser('new@example.com', { password: 'a-strong-password', external: 'github' }),
        ).resolves.toBe('6aff14b3f3ec933fa297d865');

        const inserted = mocks.insertOne.mock.calls[0][0];
        expect(inserted.email).toBe('new@example.com');
        expect(inserted.external).toBeUndefined();
        expect(inserted.password).not.toBe('a-strong-password');
        expect(await bcrypt.compare('a-strong-password', inserted.password)).toBe(true);
        expect(inserted.role).toBe('user');
    });

    it('requires a password for new accounts', async () => {
        await expect(createOrLoginUser('new@example.com', { external: 'github' }))
            .rejects.toThrow('Invalid email or password');
        expect(mocks.insertOne).not.toHaveBeenCalled();
    });

    it('rejects invalid emails through schema validation', async () => {
        await expect(createOrLoginUser('not-an-email', { password: 'whatever' }))
            .rejects.toBeTruthy();
    });
});
