#!/usr/bin/env node
/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

/**
 * Añade el aviso de autoría de Dinámicas Electrónicas a los archivos fuente.
 *
 * Uso:
 *   node scripts/add-license-header.mjs          # aplica el aviso (idempotente)
 *   node scripts/add-license-header.mjs --check  # solo verifica (falla si falta)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MARKER = 'Copyright (c) 2026 Dinámicas Electrónicas';

const BLOCK_HEADER = `/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */`;

const HASH_HEADER = `# Expanse — IDE visual de Docker Compose
# Programa de Dinámicas Electrónicas
# Contacto: dinamicas.electronicas@gmail.com
# Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
#
# Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
# Consulta el archivo LICENSE en la raíz del proyecto.`;

const SOURCE_DIRS = [
    'actions',
    'app',
    'components',
    'hooks',
    'i18n',
    'lib',
    'scripts',
    'store',
    'tests',
    'types',
];

const ROOT_FILES = [
    'eslint.config.mjs',
    'instrumentation.ts',
    'middleware.ts',
    'next.config.mjs',
    'postcss.config.mjs',
    'tailwind.config.ts',
    'vitest.config.mts',
];

// next-env.d.ts y tsconfig.tsbuildinfo son generados: no se tocan.
const SKIP_FILES = new Set(['next-env.d.ts', 'tsconfig.tsbuildinfo']);

const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.css']);
const HASH_EXTENSIONS = new Set(['.sh']);

const DIRECTIVE_RE = /^\s*(['"])use (client|server)\1;?\s*$/;

function collectFiles() {
    const files = new Set();

    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (!SKIP_FILES.has(entry.name)) {
                files.add(full);
            }
        }
    };

    for (const dir of SOURCE_DIRS) {
        const full = path.join(ROOT, dir);
        if (fs.existsSync(full)) walk(full);
    }

    for (const file of ROOT_FILES) {
        const full = path.join(ROOT, file);
        if (fs.existsSync(full)) files.add(full);
    }

    return [...files].sort();
}

function headerFor(file) {
    const ext = path.extname(file);
    if (HASH_EXTENSIONS.has(ext)) return HASH_HEADER;
    if (EXTENSIONS.has(ext)) return BLOCK_HEADER;
    return null;
}

function insertHeader(source, header, ext) {
    const lines = source.split('\n');
    let insertAt = 0;

    // Shebang y líneas iniciales vacías se conservan al principio.
    if (lines[0]?.startsWith('#!')) {
        insertAt = 1;
        if (HASH_EXTENSIONS.has(ext)) {
            return `${lines[0]}\n${header}\n${lines.slice(1).join('\n')}`;
        }
    }

    // Las directivas de Next.js deben seguir siendo la primera sentencia,
    // por eso el aviso se inserta justo después de 'use client' / 'use server'.
    for (let i = insertAt; i < Math.min(lines.length, insertAt + 3); i += 1) {
        if (DIRECTIVE_RE.test(lines[i])) {
            const before = lines.slice(0, i + 1).join('\n');
            const after = lines.slice(i + 1).join('\n');
            return `${before}\n\n${header}\n${after.startsWith('\n') ? after : `\n${after}`}`;
        }
    }

    const body = lines.join('\n');
    return `${header}\n\n${body.replace(/^\n+/, '')}`;
}

const checkOnly = process.argv.includes('--check');
const files = collectFiles();

let updated = 0;
let alreadyOk = 0;
let missing = 0;

for (const file of files) {
    const ext = path.extname(file);
    const header = headerFor(file);
    if (!header) continue;

    const source = fs.readFileSync(file, 'utf8');
    if (source.includes(MARKER)) {
        alreadyOk += 1;
        continue;
    }

    if (checkOnly) {
        missing += 1;
        console.log(`falta aviso: ${path.relative(ROOT, file)}`);
        continue;
    }

    fs.writeFileSync(file, insertHeader(source, header, ext), 'utf8');
    updated += 1;
}

if (checkOnly) {
    console.log(`\n${alreadyOk} archivos con aviso, ${missing} sin aviso.`);
    if (missing > 0) process.exit(1);
} else {
    console.log(`Aviso de autoría: ${updated} actualizados, ${alreadyOk} ya lo tenían.`);
}
