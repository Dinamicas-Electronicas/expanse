/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import type { ObjectId } from 'bson';
import { getDb } from './mongodb';

/**
 * Creates a project for an already-authenticated user.
 *
 * This helper is intentionally NOT exported from a `'use server'` module:
 * as a Server Action it would accept any `userId`, allowing a caller to write
 * projects into another account.
 */
export async function registerComposeWithoutMetadata(compose: object, userId: ObjectId) {
    const db = await getDb();
    const collection = db.collection("composes");
    const r = await collection.insertOne({
        userId,
        data: compose,
        metadata: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    const result = r.insertedId.toString();
    if (result) return result;
    throw Error("could not register");
}
