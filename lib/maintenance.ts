/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function removeOldExports(now: number): Promise<number> {
    const retentionDays = daysFromEnv('EXPORT_RETENTION_DAYS', 7);
    if (retentionDays === 0) return 0;

    const exportsDir = path.join(process.cwd(), 'public', 'exports');
    let removed = 0;

    let entries: string[];
    try {
        entries = await fs.readdir(exportsDir);
    } catch {
        return 0;
    }

    for (const entry of entries) {
        if (!entry.endsWith('.png')) continue;
        const file = path.join(exportsDir, entry);
        try {
            const stat = await fs.stat(file);
            if (stat.isFile() && now - stat.mtimeMs > retentionDays * DAY_MS) {
                await fs.unlink(file);
                removed += 1;
            }
        } catch {
            // Ignore races: the file may be replaced or removed concurrently.
        }
    }

    return removed;
}

async function removeOldWorkDirs(now: number): Promise<number> {
    const retentionDays = daysFromEnv('TMP_RETENTION_DAYS', 7);
    if (retentionDays === 0) return 0;

    const base = os.tmpdir();
    let entries: string[];
    try {
        entries = await fs.readdir(base);
    } catch {
        return 0;
    }

    let removed = 0;
    for (const entry of entries) {
        if (!entry.startsWith('expanse-')) continue;
        const directory = path.join(base, entry);
        try {
            const stat = await fs.stat(directory);
            if (stat.isDirectory() && now - stat.mtimeMs > retentionDays * DAY_MS) {
                await fs.rm(directory, { recursive: true, force: true });
                removed += 1;
            }
        } catch {
            // Ignore races with an in-flight deployment.
        }
    }

    return removed;
}

/** Removes old PNG exports and /tmp compose work directories. Best effort. */
export async function cleanupOldFiles(now = Date.now()): Promise<void> {
    try {
        const [exportsRemoved, dirsRemoved] = await Promise.all([
            removeOldExports(now),
            removeOldWorkDirs(now),
        ]);
        if (exportsRemoved || dirsRemoved) {
            console.log(`[maintenance] Removed ${exportsRemoved} exports and ${dirsRemoved} work dirs`);
        }
    } catch (error) {
        console.error('[maintenance] Cleanup failed:', error);
    }
}

/** Schedules retention cleanup once a day (and a first pass after 10 minutes). */
export function scheduleMaintenance(): void {
    const firstRun = setTimeout(() => {
        void cleanupOldFiles();
    }, 10 * 60 * 1000);
    if (typeof firstRun.unref === 'function') firstRun.unref();

    const timer = setInterval(() => {
        void cleanupOldFiles();
    }, DAY_MS);
    if (typeof timer.unref === 'function') timer.unref();
}
