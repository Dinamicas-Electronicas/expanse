#!/usr/bin/env node
/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

/**
 * Normalizes `users.email` to lowercase before the unique index is enforced.
 *
 * Usage:
 *   MONGODB_URI="mongodb://..." node scripts/normalize-emails.mjs           # dry run
 *   MONGODB_URI="mongodb://..." node scripts/normalize-emails.mjs --apply   # write
 *
 * Refuses to run when two accounts would collide after normalization.
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const apply = process.argv.includes('--apply');

if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

try {
    await client.connect();
    const users = client.db('expanse').collection('users');
    const docs = await users.find({}, { projection: { email: 1 } }).toArray();

    const groups = new Map();
    for (const doc of docs) {
        const email = String(doc.email ?? '');
        const normalized = email.trim().toLowerCase();
        if (!groups.has(normalized)) groups.set(normalized, []);
        groups.get(normalized).push({ id: doc._id, email });
    }

    const duplicates = [...groups.entries()].filter(([, entries]) => entries.length > 1);
    if (duplicates.length > 0) {
        console.error('Refusing to migrate: these accounts collide after normalization:');
        for (const [email, entries] of duplicates) {
            console.error(`  ${email}: ${entries.map((entry) => entry.id.toString()).join(', ')}`);
        }
        process.exit(2);
    }

    const pending = [];
    for (const [email, entries] of groups) {
        const entry = entries[0];
        if (entry.email !== email) {
            pending.push({ id: entry.id, from: entry.email, to: email });
        }
    }

    if (pending.length === 0) {
        console.log('All emails are already normalized.');
        process.exit(0);
    }

    for (const change of pending) {
        console.log(`${change.from} -> ${change.to}`);
    }

    if (!apply) {
        console.log(`\nDry run: ${pending.length} account(s) would change. Re-run with --apply.`);
        process.exit(0);
    }

    for (const change of pending) {
        await users.updateOne({ _id: change.id }, { $set: { email: change.to } });
    }
    console.log(`Updated ${pending.length} account(s).`);
} finally {
    await client.close();
}
