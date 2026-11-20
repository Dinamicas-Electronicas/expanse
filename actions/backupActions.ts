'use server'

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
import { ensureAuth } from "@/lib/auth";
import { ObjectId } from "bson";

/**
 * Fetches all projects (composes) for the authenticated user and returns them as a structured object
 */
export async function exportAllProjects() {
    const payload = await ensureAuth();
    const db = await getDb();
    const userId = new ObjectId(payload.userId as string);
    const collection = db.collection("composes");

    try {
        const composes = await collection.find({ userId: userId }).toArray();

        // Structure the data for export
        const exportData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            projects: composes.map((c: any) => ({
                id: c._id.toString(),
                data: c.data,
                metadata: c.metadata,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            }))
        };

        return { success: true, data: exportData };
    } catch (error) {
        console.error("Failed to export projects:", error);
        return { success: false, error: "Failed to fetch project data" };
    }
}

export async function exportToGoogleDrive() {
    return { success: false, error: "Google Drive integration coming soon" };
}

