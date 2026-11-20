/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { Compose } from "expanse-docker-lib";
import { NodeData } from "@/components/playground/playground";
import usePositionMap from "@/store/metadataMap";
import type {
    BackupConfig,
    ConnectionPoolConfig,
    DatabaseHAConfig,
    DatabaseHaConfig,
} from "@/types/library";

export type nameId = {
    id: string;
    name: string;
}
export type PositionMap = {
    id: string,
    position: {
        x: number,
        y: number
    }
}
export type ConnectionMapEntry = {
    key: string, // "sourceId:targetId"
    targetHandle: string
}

export type composeMetadata = {
    Ids: {
        servicesIds: nameId[];
        networksIds: nameId[];
        volumesIds: nameId[];
        bindingsIds: nameId[];
        envsIds: nameId[];
        labelsIds: nameId[];
    }
    positionMap: PositionMap[]
    connectionMap?: ConnectionMapEntry[]
    resources?: Record<string, { cpus?: string, memory?: string }>
}

export function extractMetadata(compose: Compose, positionMap: Map<string, NodeData>): composeMetadata {
    const result: composeMetadata = {
        Ids: {
            servicesIds: [],
            networksIds: [],
            volumesIds: [],
            bindingsIds: [],
            envsIds: [],
            labelsIds: []
        },
        positionMap: [],
        connectionMap: [],
        resources: Object.fromEntries(usePositionMap.getState().resourceMeta)
    }
    const connectionMapState = usePositionMap.getState().connectionMap;
    compose.services.forEach(service => {
        result.Ids.servicesIds.push({ name: service?.name, id: service.id })
        service.bindings.forEach(bin => {
            if (typeof bin.source === "string") {
                result.Ids.bindingsIds.push({ name: bin.source, id: bin.id })
            }
        })
        service.labels?.forEach(label => {
            result.Ids.labelsIds.push({ name: `${service.id}___${label.key}`, id: label.id })
        })
    })
    compose.networks.forEach(network => result.Ids.networksIds.push({ name: network.name, id: network.id }))
    compose.volumes.forEach(volume => result.Ids.volumesIds.push({ name: volume.name, id: volume.id }))
    compose.envs.forEach(env => result.Ids.envsIds.push({ name: env.key, id: env.id }))
    positionMap.forEach((val, id) => result.positionMap.push({
        id: id,
        position: {
            x: val.position.x,
            y: val.position.y
        }
    }))
    connectionMapState.forEach((targetHandle: string, key: string) => result.connectionMap?.push({
        key,
        targetHandle
    }))
    return result
}

export function reHydrateComposeIds(compose: Compose, metadata: composeMetadata) {
    metadata.Ids.servicesIds.forEach(({ name, id }) => {
        const service = Array.from(compose.services).find(s => s.name === name)
        if (service) {
            service.id = id
        }
        service?.bindings.forEach((bin) => {
            const found = metadata.Ids.bindingsIds.find(b => b.name === bin.source)
            if (found) {
                bin.id = found.id
            }
        })
    })
    metadata.Ids.networksIds.forEach(({ name, id }) => {
        const network = Array.from(compose.networks).find(n => n.name === name)
        if (network) {
            network.id = id
        }
    })
    metadata.Ids.envsIds.forEach(({ name, id }) => {
        const env = Array.from(compose.envs).find(n => n.key === name)
        if (env) {
            env.id = id
        }
    })
    metadata.Ids.volumesIds.forEach(({ name, id }) => {
        const vol = Array.from(compose.volumes).find(n => n.name === name)
        if (vol) {
            vol.id = id
        }
    })
    metadata.Ids.labelsIds.forEach(({ name, id }) => {
        const [serviceId, labelKey] = name.split('___');
        if (serviceId && labelKey) {
            const service = Array.from(compose.services).find(s => s.id === serviceId);
            if (service) {
                const label = service.labels?.find(l => l.key === labelKey);
                if (label) {
                    label.id = id;
                }
            }
        }
    })

    if (metadata.resources) {
        const resourceMap = new Map();
        Object.entries(metadata.resources).forEach(([name, limits]) => {
            resourceMap.set(name, limits);
        });
        usePositionMap.setState({ resourceMeta: resourceMap });
    }
}

export function recreatePositionMap(input: PositionMap[]): Map<string, NodeData> {
    const result = new Map()
    input?.forEach((v) => {
        result.set(v.id, {
            position: v.position
        })
    })
    return result
}

export function recreateConnectionMap(input: ConnectionMapEntry[] | undefined): Map<string, string> {
    const result = new Map()
    input?.forEach((v) => {
        result.set(v.key, v.targetHandle)
    })
    return result
}

import type { LoadBalancerConfig, ReplicasConfig, LoadBalancerConfigExtended } from "@/types/library";
export type { DatabaseHAConfig } from "@/types/library";

export interface HaConfig {
    loadBalancer?: LoadBalancerConfig;
    replicas?: ReplicasConfig;
    databaseHa?: DatabaseHaConfig;
}

export function extractHaConfig(template: { loadBalancer?: LoadBalancerConfig; replicas?: ReplicasConfig; databaseHa?: DatabaseHaConfig; haEnabled?: boolean }): HaConfig {
    if (!template.haEnabled) {
        return {};
    }
    return {
        loadBalancer: template.loadBalancer,
        replicas: template.replicas,
        databaseHa: template.databaseHa,
    };
}

function haproxyBalance(algorithm: LoadBalancerConfig['algorithm'] | LoadBalancerConfigExtended['algorithm']): string {
    switch (algorithm) {
        case 'least-connections': return 'leastconn';
        case 'ip-hash': return 'source';
        case 'round-robin':
        default: return 'roundrobin';
    }
}

export function generateHaproxyConfig(
    lbConfig: LoadBalancerConfig,
    servers: Array<{ name: string; host: string; port: number }>
): string {
    const serversLines = servers
        .map(s => `    server ${s.name} ${s.host}:${s.port} check inter 5s fall 2 rise 1`)
        .join('\n');

    return `global
    log stdout format raw local0
    maxconn 4096

defaults
    log     global
    mode    http
    option  httplog
    timeout connect 5000ms
    timeout client  50000ms
    timeout server  50000ms

frontend postgrest_ha
    bind :${lbConfig.port}
    default_backend postgrest_nodes

backend postgrest_nodes
    balance ${haproxyBalance(lbConfig.algorithm)}
    option httpchk GET ${lbConfig.healthCheckPath}
    http-check expect status 200
${serversLines}
`;
}

export function generatePgbouncerConfig(
    dbConfig: DatabaseHaConfig,
    dbHost: string,
    dbPort: number,
    dbName: string
): string {
    const poolMode = dbConfig.poolMode || 'transaction';
    const maxConnections = dbConfig.maxConnections || 100;
    const poolSize = dbConfig.poolSize || 20;

    return `[databases]
${dbName} = host=${dbHost} port=${dbPort} dbname=${dbName} pool_size=${poolSize}

[pgbouncer]
pool_mode = ${poolMode}
max_client_conn = ${maxConnections}
default_pool_size = ${poolSize}
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 5
server_lifetime = 3600
server_idle_timeout = 600
log_connections = 0
log_disconnections = 0
`;
}

// ============ NEW HA GENERATOR FUNCTIONS ============

export function generatePatroniConfig(
    haConfig: DatabaseHAConfig,
    nodeName: string,
    nodeRole: 'primary' | 'replica',
    etcdHosts: string = 'etcd:2379',
    clusterName: string = 'expanse-cluster',
    dbUser: string = 'postgres',
    dbPassword: string = 'postgres'
): string {
    const replication = haConfig.replication;
    const synchronousMode = replication?.mode === 'sync' ? 'on' : replication?.mode === 'semi-sync' ? 'remote_write' : 'off';
    const synchronousNodes = replication?.replicas?.filter(r => r.role === 'sync').map(r => r.region).join(',') || '*';

    return `scope: ${clusterName}
name: ${nodeName}

restapi:
  listen: 0.0.0.0:8008
  connect_address: ${nodeName}:8008

etcd:
  hosts: ${etcdHosts}

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576
    postgresql:
      use_pg_rewind: true
      use_slots: true
      parameters:
        wal_level: replica
        hot_standby: "on"
        max_wal_senders: 10
        max_replication_slots: 10
        wal_keep_size: 1GB
        synchronous_mode: ${synchronousMode}
        synchronous_node_names: "${synchronousNodes}"

postgresql:
  listen: 0.0.0.0:5432
  connect_address: ${nodeName}:5432
  data_dir: /var/lib/postgresql/data
  bin_dir: /usr/lib/postgresql/16/bin
  pgpass: /tmp/pgpass
  authentication:
    replication:
      username: replicator
      password: replicator_password
    superuser:
      username: ${dbUser}
      password: ${dbPassword}
  parameters:
    unix_socket_directories: '.'
    max_connections: 100
    shared_buffers: 256MB
    effective_cache_size: 1GB
    maintenance_work_mem: 64MB
    checkpoint_completion_target: 0.9
    wal_buffers: 16MB
    default_statistics_target: 100
    random_page_cost: 1.1
    effective_io_concurrency: 200
    work_mem: 4MB
    min_wal_size: 1GB
    max_wal_size: 4GB

tags:
  nofailover: false
  noloadbalance: false
  clonefrom: false
  replicatefrom: false
`;
}

export function generateEtcdConfig(
    clusterName: string = 'expanse-etcd',
    nodeName: string = 'etcd',
    initialCluster: string = 'etcd=http://etcd:2380'
): string {
    return `# etcd configuration for Patroni
ETCD_NAME=${nodeName}
ETCD_DATA_DIR=/bitnami/etcd
ETCD_ADVERTISE_CLIENT_URLS=http://${nodeName}:2379
ETCD_LISTEN_CLIENT_URLS=http://0.0.0.0:2379
ETCD_INITIAL_ADVERTISE_PEER_URLS=http://${nodeName}:2380
ETCD_LISTEN_PEER_URLS=http://0.0.0.0:2380
ETCD_INITIAL_CLUSTER=${initialCluster}
ETCD_INITIAL_CLUSTER_STATE=new
ETCD_INITIAL_CLUSTER_TOKEN=${clusterName}
`;
}

export function generateHaproxyConfigTCP(
    lbConfig: LoadBalancerConfigExtended,
    servers: Array<{ name: string; host: string; port: number; weight?: number; backup?: boolean }>
): string {
    const serversLines = servers
        .map(s => {
            const weight = s.weight ? ` weight ${s.weight}` : '';
            const backup = s.backup ? ' backup' : '';
            return `    server ${s.name} ${s.host}:${s.port}${weight}${backup} check inter 5s fall 2 rise 1`;
        })
        .join('\n');

    const statsPort = 8404;

    return `global
    log stdout format raw local0
    maxconn 4096

defaults
    log     global
    mode    tcp
    option  tcplog
    timeout connect 5000ms
    timeout client  300000ms
    timeout server  300000ms

frontend postgres_ha
    bind :${lbConfig.port}
    mode tcp
    default_backend postgres_nodes

backend postgres_nodes
    mode tcp
    balance ${haproxyBalance(lbConfig.algorithm)}
    option tcp-check
    tcp-check connect
${serversLines}

listen stats
    bind :${statsPort}
    mode http
    stats enable
    stats uri /stats
    stats refresh 10s
`;
}

export function generatePgbouncerConfigExtended(
    poolConfig: ConnectionPoolConfig,
    dbHost: string,
    dbPort: number,
    dbName: string,
    dbUser: string = 'postgres',
    dbPassword: string = 'postgres'
): string {
    const poolMode = poolConfig.mode || 'transaction';
    const maxConnections = poolConfig.maxConnections || 1000;
    const poolSize = poolConfig.poolSize || 25;
    const minPoolSize = 5;
    const reservePoolSize = 5;
    const idleTimeout = poolConfig.idleTimeout || 600;

    return `[databases]
${dbName} = host=${dbHost} port=${dbPort} dbname=${dbName} user=${dbUser} password=${dbPassword} pool_size=${poolSize}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = plain
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = ${poolMode}
max_client_conn = ${maxConnections}
default_pool_size = ${poolSize}
min_pool_size = ${minPoolSize}
reserve_pool_size = ${reservePoolSize}
reserve_pool_timeout = 5
server_lifetime = 3600
server_idle_timeout = ${idleTimeout}
server_connect_timeout = 15
server_login_retry = 15
query_timeout = 0
query_wait_timeout = 120
client_idle_timeout = 0
client_login_timeout = 60
autodb_idle_timeout = 3600
dns_max_ttl = 15
dns_nxdomain_ttl = 15
dns_zone_check_period = 0
tcp_keepalive = 1
tcp_keepcnt = 5
tcp_keepidle = 600
tcp_keepintvl = 60
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
stats_period = 60
`;
}

export function generateBackupCronConfig(
    backupConfig: BackupConfig,
    dbHost: string,
    dbPort: number,
    dbName: string,
    dbUser: string,
    dbPassword: string,
    storagePath: string = '/backups'
): string {
    if (!backupConfig.enabled) return '';

    const encryptionFlag = backupConfig.encryption ? ' | gpg --symmetric --cipher-algo AES256' : '';
    const pitrFlag = backupConfig.pointInTimeRecovery ? ' --wal-method=fetch' : '';

    return `
# Backup cron job for ${dbName}
# Schedule: ${backupConfig.schedule}
# Retention: ${backupConfig.retentionDays} days
# Storage: ${backupConfig.storage}
${backupConfig.schedule} pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} ${pitrFlag} ${encryptionFlag} > ${storagePath}/${dbName}_$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S).sql${backupConfig.encryption ? '.gpg' : ''}
# Cleanup old backups
0 3 * * * find ${storagePath} -name "${dbName}_*.sql*" -mtime +${backupConfig.retentionDays} -delete
`;
}

export interface HAComposeInput {
    baseCompose: any; // Compose object from expanse-docker-lib
    haConfig: DatabaseHAConfig;
    projectName: string;
    dbCredentials: {
        dbName: string;
        dbUser: string;
        dbPassword: string;
    };
}

export function generateHACompose(input: HAComposeInput): any {
    const { baseCompose, haConfig, dbCredentials } = input;
    const { dbName, dbUser, dbPassword } = dbCredentials;

    // Deep clone base compose
    const compose = JSON.parse(JSON.stringify(baseCompose));

    if (!compose.services) compose.services = {};
    if (!compose.networks) compose.networks = {};
    if (!compose.volumes) compose.volumes = {};

    const replication = haConfig.replication;
    const poolConfig = haConfig.connectionPool;
    const lbConfig = haConfig.loadBalancer;
    const backupConfig = haConfig.backup;

    const replicaCount = Math.max(1, replication?.replicas?.length || 2);
    const replicationPassword = dbPassword || 'expanse-replication';

    // Compose (non-swarm) cannot route to an overlay network. Reuse the
    // project's declared network; if the base compose uses the default
    // network, leave the generated services on it too.
    const networkName = Object.keys(compose.networks)[0];
    const serviceNetworks = networkName ? [networkName] : undefined;

    const published = (port: string) => Object.values<any>(compose.services ?? {}).some((service) =>
        Array.isArray(service?.ports) && service.ports.some((entry: unknown) => {
            const value = typeof entry === 'string' ? entry : '';
            return value.startsWith(`${port}:`);
        }),
    );

    // Ports are only published by the proxy/pool, never by every database node.
    const proxyPort = published('5432') ? 15432 : 5432;
    const poolPort = published('6432') ? 16432 : 6432;

    compose.services['db-primary'] = {
        image: 'postgres:16-alpine',
        restart: 'unless-stopped',
        environment: {
            POSTGRES_USER: dbUser,
            POSTGRES_PASSWORD: dbPassword,
            POSTGRES_DB: dbName,
            REPLICATION_USER: 'replicator',
            REPLICATION_PASSWORD: replicationPassword,
            PGDATA: '/var/lib/postgresql/data',
        },
        command: [
            'postgres',
            '-c', 'wal_level=replica',
            '-c', 'max_wal_senders=10',
            '-c', 'hot_standby=on',
            '-c', 'max_replication_slots=10',
        ],
        volumes: [
            'pg-primary-data:/var/lib/postgresql/data',
            './primary-init.sh:/docker-entrypoint-initdb.d/10-replication.sh:ro',
        ],
        healthcheck: {
            test: ['CMD', 'pg_isready', '-U', dbUser, '-d', dbName],
            interval: '10s',
            timeout: '5s',
            retries: 5,
            start_period: '30s',
        },
        ...(serviceNetworks ? { networks: serviceNetworks } : {}),
    };
    compose.volumes['pg-primary-data'] = {};

    for (let index = 1; index <= replicaCount; index += 1) {
        const serviceName = `db-replica-${index}`;
        compose.services[serviceName] = {
            image: 'postgres:16-alpine',
            restart: 'unless-stopped',
            environment: {
                MASTER_HOST: 'db-primary',
                REPLICATION_USER: 'replicator',
                REPLICATION_PASSWORD: replicationPassword,
                PGDATA: '/var/lib/postgresql/data',
            },
            volumes: [
                `pg-replica-${index}-data:/var/lib/postgresql/data`,
                './replica-init.sh:/usr/local/bin/replica-init.sh:ro',
            ],
            entrypoint: ['/bin/sh', '/usr/local/bin/replica-init.sh'],
            depends_on: { 'db-primary': { condition: 'service_healthy' } },
            healthcheck: {
                test: ['CMD', 'pg_isready', '-U', dbUser, '-d', dbName],
                interval: '10s',
                timeout: '5s',
                retries: 10,
                start_period: '30s',
            },
            ...(serviceNetworks ? { networks: serviceNetworks } : {}),
        };
        compose.volumes[`pg-replica-${index}-data`] = {};
    }

    const backendHost = lbConfig?.enabled ? 'haproxy' : 'db-primary';

    if (lbConfig?.enabled) {
        compose.services.haproxy = {
            image: 'haproxy:2.9-alpine',
            restart: 'unless-stopped',
            volumes: ['./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro'],
            ports: [`${proxyPort}:5432`],
            depends_on: {
                'db-primary': { condition: 'service_healthy' },
                ...Object.fromEntries(Array.from({ length: replicaCount }, (_, i) => [
                    `db-replica-${i + 1}`,
                    { condition: 'service_started' },
                ])),
            },
            ...(serviceNetworks ? { networks: serviceNetworks } : {}),
            healthcheck: {
                test: ['CMD', 'haproxy', '-c', '-f', '/usr/local/etc/haproxy/haproxy.cfg'],
                interval: '10s',
                timeout: '5s',
                retries: 3,
            },
        };
    }

    if (poolConfig?.enabled) {
        compose.services.pgbouncer = {
            image: 'edoburu/pgbouncer:latest',
            restart: 'unless-stopped',
            environment: {
                POOL_MODE: poolConfig.mode || 'transaction',
                MAX_CLIENT_CONN: String(poolConfig.maxConnections || 1000),
                DEFAULT_POOL_SIZE: String(poolConfig.poolSize || 25),
                MIN_POOL_SIZE: '5',
                RESERVE_POOL_SIZE: '5',
            },
            volumes: ['./pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro', './userlist.txt:/etc/pgbouncer/userlist.txt:ro'],
            ports: [`${poolPort}:6432`],
            depends_on: {
                [backendHost]: { condition: 'service_healthy' },
            },
            ...(serviceNetworks ? { networks: serviceNetworks } : {}),
            healthcheck: {
                test: ['CMD', 'pg_isready', '-h', 'localhost', '-p', '6432', '-U', dbUser],
                interval: '10s',
                timeout: '5s',
                retries: 3,
            },
        };
    }

    if (backupConfig?.enabled && backupConfig.storage === 'local') {
        compose.services.backup = {
            image: 'postgres:16-alpine',
            restart: 'unless-stopped',
            user: '0:0',
            environment: {
                PGPASSWORD: dbPassword,
                PGUSER: dbUser,
                PGDATABASE: dbName,
                DB_HOST: backendHost,
                ...(backupConfig.encryption ? { BACKUP_PASSPHRASE: replicationPassword } : {}),
            },
            volumes: [
                'pg-backups:/backups',
                './backup.sh:/backup.sh:ro',
            ],
            command: ['sh', '-c', 'while true; do sh /backup.sh; sleep 86400; done'],
            depends_on: {
                [backendHost]: { condition: 'service_healthy' },
            },
            ...(serviceNetworks ? { networks: serviceNetworks } : {}),
        };
        compose.volumes['pg-backups'] = {};
    }

    return compose;
}

export function generatePatroniConfigFiles(haConfig: DatabaseHAConfig, dbCredentials: { dbName: string; dbUser: string; dbPassword: string }): { primary: string; replica: string } {
    const primaryConfig = generatePatroniConfig(haConfig, 'db-primary', 'primary', 'etcd:2379', 'expanse-cluster', dbCredentials.dbUser, dbCredentials.dbPassword);
    const replicaConfig = generatePatroniConfig(haConfig, 'db-replica', 'replica', 'etcd:2379', 'expanse-cluster', dbCredentials.dbUser, dbCredentials.dbPassword);
    return { primary: primaryConfig, replica: replicaConfig };
}

export function generateAllHAConfigs(
    haConfig: DatabaseHAConfig,
    dbCredentials: { dbName: string; dbUser: string; dbPassword: string }
): Record<string, string> {
    const configs: Record<string, string> = {};
    const { dbName } = dbCredentials;
    const lbConfig = haConfig.loadBalancer;
    const poolConfig = haConfig.connectionPool;
    const backupConfig = haConfig.backup;
    const replicaCount = Math.max(1, haConfig.replication?.replicas?.length || 2);

    // Official PostgreSQL image: create the replication role on first init.
    configs['primary-init.sh'] = `#!/bin/sh
set -e
psql -v ON_ERROR_STOP=1 \\
  -v repl_user="$REPLICATION_USER" \\
  -v repl_password="$REPLICATION_PASSWORD" \\
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE :"repl_user" WITH REPLICATION LOGIN PASSWORD :'repl_password';
EOSQL
echo "host replication replicator 0.0.0.0/0 scram-sha-256" >> "$PGDATA/pg_hba.conf"
`;

    // The replica bootstraps itself with pg_basebackup and then starts Postgres
    // as the unprivileged postgres user.
    configs['replica-init.sh'] = `#!/bin/sh
set -e
: "\${MASTER_HOST:?MASTER_HOST is required}"
: "\${REPLICATION_USER:?REPLICATION_USER is required}"
: "\${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required}"
export PGPASSFILE=/var/lib/postgresql/.pgpass
printf '%s:5432:*:%s:%s\\n' "$MASTER_HOST" "$REPLICATION_USER" "$REPLICATION_PASSWORD" > "$PGPASSFILE"
chown postgres:postgres "$PGPASSFILE"
chmod 600 "$PGPASSFILE"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  until pg_isready -h "$MASTER_HOST" -p 5432 >/dev/null 2>&1; do sleep 2; done
  gosu postgres env PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup -h "$MASTER_HOST" -p 5432 -U "$REPLICATION_USER" -D "$PGDATA" -Fp -Xs -P -R
fi
chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
exec gosu postgres postgres
`;

    // HAProxy runs in TCP mode: HTTP health checks are invalid for Postgres.
    if (lbConfig?.enabled) {
        const servers = [
            { name: 'db-primary', host: 'db-primary', port: 5432, weight: 100 },
            ...Array.from({ length: replicaCount }, (_, index) => ({
                name: `db-replica-${index + 1}`,
                host: `db-replica-${index + 1}`,
                port: 5432,
                weight: 50,
            })),
        ];
        configs['haproxy.cfg'] = generateHaproxyConfigTCP(lbConfig, servers);
    }

    if (poolConfig?.enabled) {
        const dbHost = lbConfig?.enabled ? 'haproxy' : 'db-primary';
        configs['pgbouncer.ini'] = generatePgbouncerConfigExtended(
            poolConfig,
            dbHost,
            5432,
            dbName,
            dbCredentials.dbUser,
            dbCredentials.dbPassword,
        );
        configs['userlist.txt'] = `"${dbCredentials.dbUser}" "${dbCredentials.dbPassword}"\n`;
    }

    // The script reads PGUSER/PGDATABASE/PGPASSWORD/DB_HOST from the container
    // environment, so no credentials are baked into the file on disk.
    if (backupConfig?.enabled && backupConfig.storage === 'local') {
        const encryption = backupConfig.encryption
            ? 'gpg --symmetric --batch --passphrase "$BACKUP_PASSPHRASE" --cipher-algo AES256 "$BACKUP_FILE" && rm "$BACKUP_FILE"'
            : '';
        configs['backup.sh'] = `#!/bin/sh
set -e
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="\${BACKUP_DIR}/\${PGDATABASE}_\${DATE}.sql"

echo "Starting backup of \${PGDATABASE} at $(date)"
pg_dump -h "\${DB_HOST}" -p 5432 -U "\${PGUSER}" -d "\${PGDATABASE}" > "\${BACKUP_FILE}"
${encryption}
echo "Backup completed: \${BACKUP_FILE}"
find "\${BACKUP_DIR}" -name "\${PGDATABASE}_*.sql*" -mtime +${backupConfig.retentionDays} -delete
echo "Cleanup completed"
`;
    }

    return configs;
}
