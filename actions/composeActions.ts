"use server"

/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { getDb } from "@/lib/mongodb";
import { ObjectId } from "bson";
import { ensureAuth } from "@/lib/auth";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { isValidObjectId } from "@/lib/validation";
import { isShareActive, isShareProtected, shareExpiresAt } from "@/lib/sharePolicy";
import { createShareAccessToken, verifyShareAccessToken } from "@/lib/shareAccess";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { recordAuditEvent } from "@/lib/auditLog";

const SITE_URL = process.env.URL || '';
if (!SITE_URL) {
    console.warn('[composeActions] WARNING: URL env variable is not set. Share links will be broken.');
}

export async function shareCompose(composeId: string, password?: string) {
    const payload = await ensureAuth();
    if (!isValidObjectId(composeId)) {
        throw new Error("Invalid compose id");
    }

    if (password !== undefined && password.length > 100) {
        throw new Error("Share password is too long");
    }

    const db = await getDb();
    const shares = db.collection("shares");
    const userId = new ObjectId(payload.userId as string);

    // Only the owner can publish a compose.
    const owned = await db.collection("composes").findOne({ _id: new ObjectId(composeId), userId });
    if (!owned) {
        throw new Error("Compose not found");
    }

    // Check if a share already exists for the given composeId
    const existingShare = await shares.findOne({
        composeId: new ObjectId(composeId),
        userId,
    });

    revalidatePath("/dashboard/deploys");

    if (existingShare) {
        const expiresAt = shareExpiresAt();
        const update: Record<string, unknown> = { access: 'public', expiresAt };

        if (password !== undefined) {
            update.passwordHash = password ? await bcrypt.hash(password, 10) : null;
        }

        await shares.updateOne({ _id: existingShare._id, userId }, { $set: update });
        await recordAuditEvent({
            userId,
            action: 'share.update',
            resource: composeId,
            metadata: {
                shareId: existingShare._id.toString(),
                expiresAt,
                protected: password !== undefined ? Boolean(password) : isShareProtected(existingShare as any),
            },
        });
        return `${SITE_URL}/share?id=${existingShare._id.toString()}`;
    }

    const expiresAt = shareExpiresAt();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const insert = await shares.insertOne({
        access: "public",
        composeId: new ObjectId(composeId),
        createdAt: new Date().getTime(),
        expiresAt,
        passwordHash,
        userId,
    });

    if (!insert.insertedId) {
        throw new Error("Could not share the docker compose file");
    }

    await recordAuditEvent({
        userId,
        action: 'share.create',
        resource: composeId,
        metadata: { shareId: insert.insertedId.toString(), expiresAt },
    });

    return `${SITE_URL}/share?id=${insert.insertedId.toString()}`;
}

export type ShareAccessState = { status: 'ok' | 'locked' | 'missing' };

/**
 * Tells the share page whether to render the canvas, a password form or a
 * "not found" state. Only the status is returned, never the compose.
 */
export async function getShareAccessState(shareId: string): Promise<ShareAccessState> {
    if (!isValidObjectId(shareId)) return { status: 'missing' };

    const share = await (await getDb()).collection('shares').findOne({ _id: new ObjectId(shareId) });
    if (!share || !isShareActive(share as any)) return { status: 'missing' };
    if (!isShareProtected(share as any)) return { status: 'ok' };

    const token = (await cookies()).get('share_access')?.value;
    if (token && verifyShareAccessToken(shareId, token)) return { status: 'ok' };

    return { status: 'locked' };
}

/** Verifies the share password and stores a short-lived unlock cookie. */
export async function unlockShare(shareId: string, password: string): Promise<{ ok: boolean; error?: string }> {
    if (!isValidObjectId(shareId)) return { ok: false, error: 'Share not found' };

    const limit = rateLimit(`${await clientKey('share-unlock')}:${shareId}`, 10, 15 * 60 * 1000);
    if (!limit.ok) {
        return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` };
    }

    const shares = (await getDb()).collection('shares');
    const share = await shares.findOne({ _id: new ObjectId(shareId) });
    if (!share || !isShareActive(share as any)) return { ok: false, error: 'Share not found' };
    if (!isShareProtected(share as any)) return { ok: true };

    if (typeof password !== 'string' || !(await bcrypt.compare(password, String(share.passwordHash)))) {
        await recordAuditEvent({
            userId: share.userId ?? null,
            action: 'share.unlock_failed',
            resource: shareId,
            result: 'failure',
        });
        return { ok: false, error: 'Invalid password' };
    }

    const token = createShareAccessToken(shareId);
    if (!token) return { ok: false, error: 'Server configuration error' };

    (await cookies()).set('share_access', token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: (process.env.URL || '').startsWith('https://'),
        maxAge: 60 * 60,
    });
    await recordAuditEvent({ userId: share.userId ?? null, action: 'share.unlock', resource: shareId });
    return { ok: true };
}

export const getComposeByShareId = async (shareId: string) => {
    if (!isValidObjectId(shareId)) {
        return undefined;
    }

    // Password-protected shares require a valid unlock cookie (or key).
    const access = await getShareAccessState(shareId);
    if (access.status !== 'ok') return undefined;

    const db = await getDb();
    const collection = db.collection("shares");

    try {
        const compose = await collection.aggregate([
            // Public and non-expired shares are the only ones exposed.
            {
                $match: {
                    _id: new ObjectId(shareId),
                    access: "public",
                    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: Date.now() } }],
                }
            },
            {
                $lookup: {
                    from: "composes",
                    localField: "composeId",
                    foreignField: "_id",
                    as: "composeDetails"
                }
            },
            { $limit: 1 }
        ]).toArray();

        if (!compose[0]) return undefined;

        return {
            id: compose[0].composeId.toString(),
            data: compose[0].composeDetails
        };
    } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch compose");
    }
};

export const getAllMyShares = async () => {
    if (process.env.npm_lifecycle_event === 'build') {
        return [];
    }
    const payload = await ensureAuth();
    const db = await getDb();
    const collection = db.collection("shares");

    try {
        const shares = await collection.aggregate([
            { $match: { userId: new ObjectId(payload.userId as string) } },
            {
                $lookup: {
                    from: "composes",
                    localField: "composeId",
                    foreignField: "_id",
                    as: "composeDetails",
                    pipeline: [{ $project: { "data.name": 1, _id: 0 } }],
                },
            },
            { $unwind: { path: "$composeDetails", preserveNullAndEmptyArrays: true } },
            { $addFields: { name: "$composeDetails.data.name" } },
            { $project: { composeDetails: 0 } },
            { $sort: { createdAt: -1 } },
        ]).toArray();

        return (shares || []).map((share: any) => {
            const { passwordHash, ...rest } = share;
            return { ...rest, protected: Boolean(passwordHash) };
        });
    } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch shares");
    }
};

export const deleteShareById = async (shareId: string) => {
    const payload = await ensureAuth();
    if (!isValidObjectId(shareId)) {
        throw new Error("Invalid share id");
    }
    const db = await getDb();
    const collection = db.collection("shares");

    try {
        const result = await collection.deleteOne({
            _id: new ObjectId(shareId),
            userId: new ObjectId(payload.userId as string)
        });

        revalidatePath("/dashboard/deploys");
        if (result.deletedCount > 0) {
            await recordAuditEvent({
                userId: payload.userId as string,
                action: 'share.delete',
                resource: shareId,
            });
        }
        return result;
    } catch (error) {
        console.error(error);
        throw new Error("Failed to delete share");
    }
};