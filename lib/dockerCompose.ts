/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import YAML from 'yaml';
import type { composeMetadata } from '@/lib/metadata';

/**
 * Docker Compose only accepts this pattern for service, network and volume
 * keys. Anything else (parentheses, slashes, accents, emoji, ...) makes
 * `docker compose config` fail with:
 *   networks additional properties '<name>' not allowed
 */
export const DOCKER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
export const DOCKER_NAME_MAX_LENGTH = 63;

/**
 * Normalizes an arbitrary label (template name, image name, user input, ...)
 * into a valid Docker Compose key.
 *
 * "WordPress (Fullstack)" -> "wordpress_fullstack"
 * "My App / v2"           -> "my_app_v2"
 */
export function sanitizeDockerName(raw: string | undefined | null, fallback = 'service'): string {
    const cleaned = String(raw ?? '')
        .normalize('NFKD')
        // strip diacritics so "aplicación" -> "aplicacion"
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/g, '_')
        .replace(/_{2,}/g, '_')
        // keys must start with an alphanumeric character
        .replace(/^[^a-z0-9]+/, '')
        .slice(0, DOCKER_NAME_MAX_LENGTH)
        // keys must not end with a separator
        .replace(/[_.-]+$/, '');

    return cleaned || fallback;
}

/** Returns true when the value can be used as-is as a compose key. */
export function isValidDockerName(name: string | undefined | null): boolean {
    if (!name) return false;
    return DOCKER_NAME_PATTERN.test(name) && name.length <= DOCKER_NAME_MAX_LENGTH;
}

/** Returns a name that is guaranteed to be free inside `taken`. */
export function uniqueDockerName(name: string, taken: Set<string>): string {
    if (!taken.has(name)) return name;
    let i = 2;
    let candidate = `${name}_${i}`;
    while (taken.has(candidate)) {
        i += 1;
        candidate = `${name}_${i}`;
    }
    return candidate;
}

type ComposeLike = {
    services?: Record<string, any>;
    networks?: Record<string, any>;
    volumes?: Record<string, any>;
};

/**
 * Renames invalid top-level keys (networks, volumes and services) and keeps
 * every reference in sync. Compose validates these keys before doing anything
 * else, so a single invalid key breaks the whole deployment.
 */
export function normalizeComposeNames<T extends ComposeLike>(doc: T): T {
    if (!doc || typeof doc !== 'object') return doc;

    const renameNetworks = new Map<string, string>();
    if (doc.networks && typeof doc.networks === 'object') {
        const taken = new Set(Object.keys(doc.networks).filter(isValidDockerName));
        const normalized: Record<string, any> = {};
        for (const [key, value] of Object.entries(doc.networks)) {
            const next = isValidDockerName(key) ? key : uniqueDockerName(sanitizeDockerName(key, 'network'), taken);
            taken.add(next);
            renameNetworks.set(key, next);
            normalized[next] = value;
        }
        doc.networks = normalized;
    }

    const renameVolumes = new Map<string, string>();
    if (doc.volumes && typeof doc.volumes === 'object') {
        const taken = new Set(Object.keys(doc.volumes).filter(isValidDockerName));
        const normalized: Record<string, any> = {};
        for (const [key, value] of Object.entries(doc.volumes)) {
            const next = isValidDockerName(key) ? key : uniqueDockerName(sanitizeDockerName(key, 'volume'), taken);
            taken.add(next);
            renameVolumes.set(key, next);
            normalized[next] = value;
        }
        doc.volumes = normalized;
    }

    const renameServices = new Map<string, string>();
    if (doc.services && typeof doc.services === 'object') {
        const taken = new Set(Object.keys(doc.services).filter(isValidDockerName));
        const normalized: Record<string, any> = {};
        for (const [key, value] of Object.entries(doc.services)) {
            const next = isValidDockerName(key) ? key : uniqueDockerName(sanitizeDockerName(key, 'service'), taken);
            taken.add(next);
            renameServices.set(key, next);
            normalized[next] = value;
        }
        doc.services = normalized;
    }

    const mapServiceName = (name: string) => renameServices.get(name) ?? name;

    for (const service of Object.values<any>(doc.services ?? {})) {
        if (!service || typeof service !== 'object') continue;

        // networks: ["a"] or { a: {...} }
        if (Array.isArray(service.networks)) {
            service.networks = service.networks.map((net: unknown) =>
                typeof net === 'string' ? (renameNetworks.get(net) ?? net) : net);
        } else if (service.networks && typeof service.networks === 'object') {
            service.networks = Object.fromEntries(
                Object.entries(service.networks).map(([net, conf]) => [renameNetworks.get(net) ?? net, conf]),
            );
        }

        // depends_on: ["a"] or { a: {...} }
        if (Array.isArray(service.depends_on)) {
            service.depends_on = service.depends_on.map((dep: unknown) =>
                typeof dep === 'string' ? mapServiceName(dep) : dep);
        } else if (service.depends_on && typeof service.depends_on === 'object') {
            service.depends_on = Object.fromEntries(
                Object.entries(service.depends_on).map(([dep, conf]) => [mapServiceName(dep), conf]),
            );
        }

        // links / volumes_from / network_mode / extends
        for (const field of ['links', 'volumes_from'] as const) {
            if (Array.isArray(service[field])) {
                service[field] = service[field].map((entry: unknown) => {
                    if (typeof entry !== 'string') return entry;
                    const [ref, ...rest] = entry.split(':');
                    const mapped = mapServiceName(ref);
                    return [mapped, ...rest].join(':');
                });
            }
        }

        if (typeof service.network_mode === 'string' && service.network_mode.startsWith('service:')) {
            service.network_mode = `service:${mapServiceName(service.network_mode.slice('service:'.length))}`;
        }
        if (typeof service.network_mode === 'string' && service.network_mode.startsWith('container:')) {
            // container ids are opaque, nothing to normalize
        }
        if (service.extends && typeof service.extends === 'object' && typeof service.extends.service === 'string') {
            service.extends.service = mapServiceName(service.extends.service);
        }

        // volumes: "name:/path" only when "name" is a declared volume
        if (Array.isArray(service.volumes)) {
            service.volumes = service.volumes.map((entry: unknown) => {
                if (typeof entry !== 'string') return entry;
                const [source, ...rest] = entry.split(':');
                if (rest.length === 0) return entry;
                const mapped = renameVolumes.get(source);
                return mapped ? [mapped, ...rest].join(':') : entry;
            });
        }
    }

    return doc;
}

export const DB_HEALTHCHECKS: Record<string, object> = {
    mariadb: { test: ['CMD-SHELL', 'mysqladmin ping -h localhost -u root -p"$${MYSQL_ROOT_PASSWORD:-$${MARIADB_ROOT_PASSWORD:-}}"'], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    mysql: { test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost', '--silent'], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    postgres: { test: ['CMD-SHELL', 'pg_isready -h localhost -U $${POSTGRES_USER:-postgres}'], interval: '10s', timeout: '5s', retries: 5, start_period: '20s' },
    mongo: { test: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"], interval: '10s', timeout: '5s', retries: 5, start_period: '20s' },
    redis: { test: ['CMD', 'redis-cli', 'ping'], interval: '5s', timeout: '3s', retries: 5 },
    couchdb: { test: ['CMD-SHELL', 'curl -f http://localhost:5984/_up || exit 1'], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    cassandra: { test: ['CMD-SHELL', "cqlsh -e 'describe cluster' || exit 1"], interval: '10s', timeout: '5s', retries: 5, start_period: '60s' },
    neo4j: { test: ['CMD', 'cypher-shell', '-u', 'neo4j', '-p', '$${NEO4J_PASSWORD:-password}', 'RETURN 1'], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    clickhouse: { test: ['CMD-SHELL', "clickhouse-client --query 'SELECT 1'"], interval: '10s', timeout: '5s', retries: 5, start_period: '20s' },
    influxdb: { test: ['CMD', 'influx', 'ping'], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    timescale: { test: ['CMD-SHELL', 'pg_isready -h localhost -U $${POSTGRES_USER:-postgres}'], interval: '10s', timeout: '5s', retries: 5, start_period: '20s' },
    cockroachdb: { test: ['CMD-SHELL', "cockroach sql --execute 'SELECT 1'"], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    surrealdb: { test: ['CMD-SHELL', 'surreal sql --namespace namespace --database database --user root --pass root --pretty exit 0'], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    scylladb: { test: ['CMD-SHELL', "cqlsh -e 'describe cluster' || exit 1"], interval: '10s', timeout: '5s', retries: 5, start_period: '60s' },
    memcached: { test: ['CMD', 'memcached', '-v'], interval: '10s', timeout: '5s', retries: 3 },
    dragonfly: { test: ['CMD', 'redis-cli', 'ping'], interval: '5s', timeout: '3s', retries: 5 },
    influxdb2: { test: ['CMD', 'influx', 'ping'], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    questdb: { test: ['CMD-SHELL', 'curl -f http://localhost:9000/health || exit 1'], interval: '10s', timeout: '5s', retries: 5, start_period: '30s' },
    timescaledb: { test: ['CMD-SHELL', 'pg_isready -h localhost -U $${POSTGRES_USER:-postgres}'], interval: '10s', timeout: '5s', retries: 5, start_period: '20s' },
};

export function isDbImage(image: string): string | null {
    const img = image.toLowerCase();
    for (const key of Object.keys(DB_HEALTHCHECKS)) {
        if (img.includes(key)) return key;
    }
    return null;
}

export function stampComposeOwnership(doc: any, owner: string, composeId: string): void {
    if (!doc?.services || typeof doc.services !== 'object') return;

    for (const service of Object.values<any>(doc.services)) {
        if (!service || typeof service !== 'object') continue;

        const labels = service.labels;
        if (Array.isArray(labels)) {
            const entries = labels.filter((label: unknown) => typeof label === 'string') as string[];
            service.labels = [
                ...entries.filter((label) => !label.startsWith('com.expanse.')),
                `com.expanse.owner=${owner}`,
                `com.expanse.compose=${composeId}`,
            ];
        } else if (labels && typeof labels === 'object') {
            service.labels = {
                ...labels,
                'com.expanse.owner': owner,
                'com.expanse.compose': composeId,
            };
        } else {
            service.labels = {
                'com.expanse.owner': owner,
                'com.expanse.compose': composeId,
            };
        }
    }
}

export function patchComposeYaml(
    yamlText: string,
    metadata?: composeMetadata,
    ownership?: { owner: string; composeId: string },
): string {
    const doc = YAML.parse(yamlText);
    if (!doc?.services) return yamlText;

    if (ownership) {
        stampComposeOwnership(doc, ownership.owner, ownership.composeId);
    }

    // Compose refuses to run when any key is not `[a-zA-Z0-9._-]+`
    // (e.g. a stack called "WordPress (Fullstack)" produced
    // "wordpress(fullstack)_net"). Normalize before anything else.
    normalizeComposeNames(doc);

    const dbServiceNames = new Set<string>();
    for (const [name, svc] of Object.entries<any>(doc.services)) {
        const key = isDbImage((svc.image || '').toLowerCase());
        if (key) {
            dbServiceNames.add(name);
            if (!svc.healthcheck) svc.healthcheck = DB_HEALTHCHECKS[key];
        }
    }

    for (const svc of Object.values<any>(doc.services)) {
        if (!svc.depends_on) continue;
        if (Array.isArray(svc.depends_on)) {
            svc.depends_on = Object.fromEntries(svc.depends_on.map((dep: string) => [
                dep,
                { condition: dbServiceNames.has(dep) ? 'service_healthy' : 'service_started' },
            ]));
        } else if (typeof svc.depends_on === 'object') {
            for (const [dep, conf] of Object.entries<any>(svc.depends_on)) {
                if (dbServiceNames.has(dep) && conf.condition !== 'service_healthy') {
                    conf.condition = 'service_healthy';
                }
            }
        }
    }

    if (metadata?.resources) {
        for (const [serviceName, limits] of Object.entries(metadata.resources)) {
            if (doc.services[serviceName]) {
                const svc = doc.services[serviceName];
                svc.deploy ??= {};
                svc.deploy.resources ??= {};
                svc.deploy.resources.limits = { cpus: limits.cpus, memory: limits.memory };
            }
        }
    }

    return YAML.stringify(doc);
}
