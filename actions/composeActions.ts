"use server"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { getDb } from "@/lib/mongodb";
import { ObjectId } from "bson";
import { ensureAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { isValidObjectId } from "@/lib/validation";
import { isShareActive, shareExpiresAt } from "@/lib/sharePolicy";
import { recordAuditEvent } from "@/lib/auditLog";

const SITE_URL = process.env.URL || '';
if (!SITE_URL) {
    console.warn('[composeActions] WARNING: URL env variable is not set. Share links will be broken.');
}

export async function shareCompose(composeId: string) {
    const payload = await ensureAuth();
    if (!isValidObjectId(composeId)) {
        throw new Error("Invalid compose id");
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
        if (isShareActive(existingShare as any)) {
            return `${SITE_URL}/share?id=${existingShare._id.toString()}`;
        }
        // Refresh an expired share instead of creating a second document.
        const expiresAt = shareExpiresAt();
        await shares.updateOne(
            { _id: existingShare._id, userId },
            { $set: { access: 'public', expiresAt } },
        );
        await recordAuditEvent({
            userId,
            action: 'share.refresh',
            resource: composeId,
            metadata: { shareId: existingShare._id.toString(), expiresAt },
        });
        return `${SITE_URL}/share?id=${existingShare._id.toString()}`;
    }

    const expiresAt = shareExpiresAt();
    const insert = await shares.insertOne({
        access: "public",
        composeId: new ObjectId(composeId),
        createdAt: new Date().getTime(),
        expiresAt,
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

export const getComposeByShareId = async (shareId: string) => {
    if (!isValidObjectId(shareId)) {
        return undefined;
    }

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

        return shares || [];
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
        return result;
    } catch (error) {
        console.error(error);
        throw new Error("Failed to delete share");
    }
};