/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import path from 'node:path';

export type PolicyViolation = {
    ok: false;
    code: string;
    path: string;
    message: string;
};

export type PolicyResult = { ok: true } | PolicyViolation;

type PolicyOptions = {
    /** Allows mounts/absolute binds outside the sensitive list (admin opt-in). */
    allowHostMounts?: boolean;
    /** Allows `build:` contexts (arbitrary Dockerfile execution on the host). */
    allowBuild?: boolean;
    /** Allows mounting the Docker socket (admin opt-in; equivalent to root). */
    allowDockerSocket?: boolean;
    /** Maximum number of services in the document. */
    maxServices?: number;
};

const SENSITIVE_PATHS = [
    '/',
    '/boot',
    '/dev',
    '/etc',
    '/home',
    '/proc',
    '/root',
    '/sys',
    '/usr',
    '/var/lib/docker',
    '/var/run',
];

const DENIED_SERVICE_KEYS = ['privileged', 'cap_add', 'devices', 'pid', 'ipc', 'uts', 'userns_mode'];

function violation(code: string, at: string, message: string): PolicyViolation {
    return { ok: false, code, path: at, message };
}

function normalizeMountSource(source: string): string {
    return path.posix.normalize(String(source ?? '').trim());
}

function isSensitiveMount(source: string): boolean {
    const normalized = normalizeMountSource(source);
    if (normalized === '.' || normalized === './') return false;
    if (normalized === '..' || normalized.startsWith('../')) return true;
    if (normalized.startsWith('~/')) return true;
    if (normalized.includes('docker.sock')) return true;
    if (!normalized.startsWith('/')) return false;

    return SENSITIVE_PATHS.some((sensitive) => {
        if (sensitive === '/') return normalized === '/';
        return normalized === sensitive || normalized.startsWith(`${sensitive}/`);
    });
}

function checkMount(source: string, at: string, options: PolicyOptions): PolicyViolation | null {
    if (String(source).includes('docker.sock')) {
        if (options.allowDockerSocket) return null;
        return violation('COMPOSE_POLICY_DOCKER_SOCKET', at, 'Mounting the Docker socket is not allowed');
    }

    if (options.allowHostMounts) {
        return null;
    }

    if (isSensitiveMount(source)) {
        return violation('COMPOSE_POLICY_SENSITIVE_MOUNT', at, `Mounting ${source} is not allowed`);
    }
    return null;
}

function checkVolumes(volumes: unknown, serviceName: string, options: PolicyOptions): PolicyViolation | null {
    if (!Array.isArray(volumes)) return null;

    for (let index = 0; index < volumes.length; index += 1) {
        const entry = volumes[index];
        const at = `services.${serviceName}.volumes[${index}]`;

        if (typeof entry === 'string') {
            const source = entry.split(':')[0];
            if (!source) continue;
            // A named volume (no slash, no dot) is managed by Docker, not the host.
            if (!source.startsWith('.') && !source.startsWith('/') && !source.startsWith('~')) continue;
            const result = checkMount(source, at, options);
            if (result) return result;
            continue;
        }

        if (entry && typeof entry === 'object') {
            const bind = entry as { type?: string; source?: string; target?: string };
            if (bind.type && bind.type !== 'bind') continue;
            if (typeof bind.source === 'string') {
                const result = checkMount(bind.source, at, options);
                if (result) return result;
            }
        }
    }

    return null;
}

/**
 * Validates a parsed Compose document before it is written or executed.
 *
 * The client controls this YAML, so everything that can escape the container
 * or read host files must be rejected here: privileged mode, capabilities,
 * host namespaces, devices, the Docker socket, sensitive bind mounts and
 * build contexts. Named volumes and normal application settings are allowed.
 */
export function validateComposePolicy(doc: unknown, options: PolicyOptions = {}): PolicyResult {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        return violation('COMPOSE_POLICY_INVALID', '$', 'Compose document must be an object');
    }

    const compose = doc as Record<string, any>;
    const services = compose.services;

    if (!services || typeof services !== 'object' || Array.isArray(services)) {
        return violation('COMPOSE_POLICY_INVALID', 'services', 'Compose must define services');
    }

    const serviceNames = Object.keys(services);
    if (serviceNames.length === 0) {
        return violation('COMPOSE_POLICY_INVALID', 'services', 'Compose must define at least one service');
    }
    const maxServices = options.maxServices ?? 50;
    if (serviceNames.length > maxServices) {
        return violation('COMPOSE_POLICY_TOO_LARGE', 'services', `Too many services (max ${maxServices})`);
    }

    for (const [name, value] of Object.entries<any>(services)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return violation('COMPOSE_POLICY_INVALID', `services.${name}`, 'Service must be an object');
        }

        const at = `services.${name}`;

        if (typeof value.image !== 'string' || !value.image.trim()) {
            return violation('COMPOSE_POLICY_INVALID', `${at}.image`, 'Service image is required');
        }

        for (const key of DENIED_SERVICE_KEYS) {
            if (value[key] === undefined) continue;
            if (key === 'privileged' && value[key] === false) continue;
            if (Array.isArray(value[key]) && value[key].length === 0) continue;
            return violation('COMPOSE_POLICY_DENIED', `${at}.${key}`, `${key} is not allowed`);
        }

        if (typeof value.network_mode === 'string') {
            const mode = value.network_mode.toLowerCase();
            if (mode === 'host' || mode.startsWith('container:') || mode.startsWith('service:')) {
                return violation('COMPOSE_POLICY_NETWORK_MODE', `${at}.network_mode`, `network_mode ${mode} is not allowed`);
            }
        }

        const volumesViolation = checkVolumes(value.volumes, name, options);
        if (volumesViolation) return volumesViolation;

        if (value.build !== undefined && !options.allowBuild) {
            return violation('COMPOSE_POLICY_BUILD', `${at}.build`, 'Building images from a compose file is disabled');
        }

        if (value.env_file !== undefined) {
            const files = Array.isArray(value.env_file)
                ? value.env_file
                : typeof value.env_file === 'string'
                    ? [value.env_file]
                    : [];
            for (let index = 0; index < files.length; index += 1) {
                const file = files[index];
                const source = typeof file === 'string' ? file : file?.path;
                if (typeof source !== 'string') continue;
                if (isSensitiveMount(source)) {
                    return violation('COMPOSE_POLICY_SENSITIVE_FILE', `${at}.env_file[${index}]`, 'env_file cannot read sensitive host files');
                }
            }
        }

        if (value.extends && typeof value.extends === 'object' && typeof value.extends.file === 'string') {
            return violation('COMPOSE_POLICY_EXTENDS', `${at}.extends.file`, 'extends from external files is disabled');
        }
    }

    for (const key of ['configs', 'secrets']) {
        if (compose[key] && Object.keys(compose[key]).length > 0) {
            return violation('COMPOSE_POLICY_HOST_FILES', key, `${key} can read host files and is disabled`);
        }
    }

    return { ok: true };
}
