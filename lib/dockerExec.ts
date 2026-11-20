/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const COMPOSE_PROJECT_PREFIX = 'expanse-project_';

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
/** Docker accepts this subset for container / image / volume / network refs. */
const DOCKER_REFERENCE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.:@/-]*$/;

const EXEC_OPTIONS = { maxBuffer: 10 * 1024 * 1024, timeout: 60 * 1000 };
const COMPOSE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Validates a Mongo ObjectId before it is used to build filesystem paths or
 * compose project names. Without this, values coming from the client were
 * interpolated straight into shell commands (`docker compose -p ... ${id}`).
 */
export function assertComposeId(composeId: string): string {
    const value = String(composeId ?? '').trim();
    if (!OBJECT_ID_RE.test(value)) {
        throw new Error('Invalid compose id');
    }
    return value;
}

export function composeProjectName(composeId: string): string {
    return `${COMPOSE_PROJECT_PREFIX}${assertComposeId(composeId)}`;
}

export function composeWorkDir(composeId: string): string {
    // Persist relative bind mounts and generated HA config when the deployment
    // provides a volume (docker-compose uses /app/.expanse). Falls back to the
    // OS temp directory for direct runs and tests.
    const base = process.env.EXPANSE_WORK_DIR || os.tmpdir();
    return path.join(base, `expanse-${assertComposeId(composeId)}`);
}

/** Validates a container/volume/network/image reference before passing it to Docker. */
export function assertDockerReference(value: string, label = 'argument'): string {
    const ref = String(value ?? '').trim();
    if (!ref || ref.length > 255 || !DOCKER_REFERENCE_RE.test(ref)) {
        throw new Error(`Invalid ${label}`);
    }
    return ref;
}

export function assertDockerIdList(value: string, label = 'ids'): string[] {
    const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.map((part) => assertDockerReference(part, label));
}

type RunResult = { stdout: string; stderr: string };

/** Runs docker with an argument array. No shell is involved, so nothing is interpolated. */
export async function runDocker(args: string[], options: { timeout?: number; input?: never } = {}): Promise<RunResult> {
    return execFileAsync('docker', args, { ...EXEC_OPTIONS, ...options });
}

export async function runCompose(
    args: string[],
    { project, yamlPath, timeout }: { project: string; yamlPath?: string; timeout?: number },
): Promise<RunResult> {
    const composeArgs = ['compose'];
    if (yamlPath) composeArgs.push('-f', yamlPath);
    composeArgs.push('-p', project, ...args);
    // An explicit `timeout: undefined` must not disable the default.
    return execFileAsync('docker', composeArgs, {
        ...EXEC_OPTIONS,
        timeout: timeout ?? COMPOSE_TIMEOUT_MS,
    });
}
