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
    balance ${lbConfig.algorithm}
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
    balance ${lbConfig.algorithm}
    option httpchk GET ${lbConfig.healthCheckPath}
    http-check expect status 200
${serversLines}

listen stats
    bind :${statsPort}
    mode http
    stats enable
    stats uri /stats
    stats refresh 10s
    stats auth admin:admin
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

    const replicaCount = replication?.replicas?.length || 2;
    const clusterName = 'expanse-cluster';
    const etcdHosts = 'etcd:2379';

    // 1. Add etcd service for coordination
    compose.services.etcd = {
        image: 'bitnami/etcd:3.5',
        environment: {
            ETCD_NAME: 'etcd',
            ETCD_DATA_DIR: '/bitnami/etcd',
            ETCD_ADVERTISE_CLIENT_URLS: 'http://etcd:2379',
            ETCD_LISTEN_CLIENT_URLS: 'http://0.0.0.0:2379',
            ETCD_INITIAL_ADVERTISE_PEER_URLS: 'http://etcd:2380',
            ETCD_LISTEN_PEER_URLS: 'http://0.0.0.0:2380',
            ETCD_INITIAL_CLUSTER: 'etcd=http://etcd:2380',
            ETCD_INITIAL_CLUSTER_STATE: 'new',
            ETCD_INITIAL_CLUSTER_TOKEN: 'expanse-etcd'
        },
        volumes: ['etcd-data:/bitnami/etcd'],
        ports: ['2379:2379', '2380:2380'],
        healthcheck: {
            test: ['CMD', 'etcdctl', 'endpoint', 'health'],
            interval: '10s',
            timeout: '5s',
            retries: 5
        },
        networks: ['expanse-network'],
        deploy: {
            restart_policy: { condition: 'on-failure' }
        }
    };
    compose.volumes['etcd-data'] = {};

    // 2. Add primary database with Patroni
    compose.services['db-primary'] = {
        image: 'postgres:16-alpine',
        environment: {
            POSTGRES_PASSWORD: dbPassword,
            POSTGRES_USER: dbUser,
            POSTGRES_DB: dbName,
            PATRONI_SCOPE: clusterName,
            PATRONI_NAME: 'db-primary',
            PATRONI_ETCD_HOSTS: etcdHosts,
            // Patroni config will be mounted as file
        },
        volumes: [
            'pg-primary-data:/var/lib/postgresql/data',
            './patroni-primary.yml:/etc/patroni/patroni.yml:ro'
        ],
        ports: ['5432:5432'],
        healthcheck: {
            test: ['CMD-SHELL', 'patronictl -c /etc/patroni/patroni.yml list'],
            interval: '10s',
            timeout: '5s',
            retries: 5,
            start_period: '30s'
        },
        networks: ['expanse-network'],
        deploy: {
            placement: { constraints: ['node.role == manager'] },
            restart_policy: { condition: 'on-failure' }
        }
    };
    compose.volumes['pg-primary-data'] = {};

    // 3. Add replica databases with Patroni (scalable)
    compose.services['db-replica'] = {
        image: 'postgres:16-alpine',
        environment: {
            POSTGRES_PASSWORD: dbPassword,
            POSTGRES_USER: dbUser,
            POSTGRES_DB: dbName,
            PATRONI_SCOPE: clusterName,
            PATRONI_ETCD_HOSTS: etcdHosts,
            PATRONI_NAME: 'db-replica-{{.Task.Slot}}'
        },
        volumes: [
            'pg-replica-data:/var/lib/postgresql/data',
            './patroni-replica.yml:/etc/patroni/patroni.yml:ro'
        ],
        ports: ['5432:5432'],
        healthcheck: {
            test: ['CMD-SHELL', 'patronictl -c /etc/patroni/patroni.yml list'],
            interval: '10s',
            timeout: '5s',
            retries: 5,
            start_period: '30s'
        },
        networks: ['expanse-network'],
        deploy: {
            replicas: replicaCount,
            restart_policy: { condition: 'on-failure' },
            placement: { preferences: [{ spread: 'node.labels.zone' }] }
        }
    };
    compose.volumes['pg-replica-data'] = {};

    // 4. Add PgBouncer for connection pooling
    if (poolConfig?.enabled) {
        compose.services.pgbouncer = {
            image: 'edoburu/pgbouncer:latest',
            environment: {
                // DATABASES will be populated at runtime via config file
                POOL_MODE: poolConfig.mode || 'transaction',
                MAX_CLIENT_CONN: String(poolConfig.maxConnections || 1000),
                DEFAULT_POOL_SIZE: String(poolConfig.poolSize || 25),
                MIN_POOL_SIZE: '5',
                RESERVE_POOL_SIZE: '5'
            },
            volumes: ['./pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro'],
            ports: ['6432:6432'],
            depends_on: {
                haproxy: { condition: 'service_healthy' }
            },
            healthcheck: {
                test: ['CMD', 'pg_isready', '-h', 'localhost', '-p', '6432', '-U', dbUser],
                interval: '10s',
                timeout: '5s',
                retries: 3
            },
            networks: ['expanse-network'],
            deploy: { restart_policy: { condition: 'on-failure' } }
        };
    }

    // 5. Add HAProxy for load balancing
    if (lbConfig?.enabled) {
        compose.services.haproxy = {
            image: 'haproxy:2.9-alpine',
            volumes: ['./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro'],
            ports: ['5432:5432', '8404:8404'],
            healthcheck: {
                test: ['CMD', 'haproxy', '-c', '-f', '/usr/local/etc/haproxy/haproxy.cfg'],
                interval: '10s',
                timeout: '5s',
                retries: 3
            },
            networks: ['expanse-network'],
            deploy: { restart_policy: { condition: 'on-failure' } }
        };
    }

    // 6. Add backup sidecar if enabled
    if (backupConfig?.enabled && backupConfig.storage === 'local') {
        compose.services.backup = {
            image: 'postgres:16-alpine',
            environment: {
                PGPASSWORD: dbPassword,
                BACKUP_SCHEDULE: backupConfig.schedule,
                BACKUP_RETENTION_DAYS: String(backupConfig.retentionDays),
                DB_HOST: lbConfig?.enabled ? 'haproxy' : 'db-primary',
                DB_PORT: '5432',
                DB_NAME: dbName,
                DB_USER: dbUser
            },
            volumes: [
                'pg-backups:/backups',
                './backup.sh:/backup.sh:ro'
            ],
            command: ['sh', '-c', 'chmod +x /backup.sh && /backup.sh'],
            depends_on: {
                haproxy: { condition: 'service_healthy' }
            },
            networks: ['expanse-network'],
            deploy: { restart_policy: { condition: 'on-failure' } }
        };
        compose.volumes['pg-backups'] = {};
    }

    // Ensure network exists
    compose.networks['expanse-network'] = {
        driver: 'overlay',
        attachable: true
    };

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
    const { dbName, dbUser, dbPassword } = dbCredentials;
    const lbConfig = haConfig.loadBalancer;
    const poolConfig = haConfig.connectionPool;
    const backupConfig = haConfig.backup;

    // Patroni configs
    const patroniConfigs = generatePatroniConfigFiles(haConfig, dbCredentials);
    configs['patroni-primary.yml'] = patroniConfigs.primary;
    configs['patroni-replica.yml'] = patroniConfigs.replica;

    // HAProxy config
    if (lbConfig?.enabled) {
        const haproxyServers = [
            { name: 'db-primary', host: 'db-primary', port: 5432, weight: 100 },
            { name: 'db-replica-1', host: 'db-replica', port: 5432, weight: 50 },
            { name: 'db-replica-2', host: 'db-replica', port: 5432, weight: 50 }
        ];
        configs['haproxy.cfg'] = generateHaproxyConfigTCP(lbConfig, haproxyServers);
    }

    // PgBouncer config
    if (poolConfig?.enabled) {
        const dbHost = lbConfig?.enabled ? 'haproxy' : 'db-primary';
        configs['pgbouncer.ini'] = generatePgbouncerConfigExtended(poolConfig, dbHost, 5432, dbName, dbUser, dbPassword);
    }

    // Backup script
    if (backupConfig?.enabled && backupConfig.storage === 'local') {
        const dbHost = lbConfig?.enabled ? 'haproxy' : 'db-primary';
        configs['backup.sh'] = `#!/bin/bash
set -e
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="\${BACKUP_DIR}/${dbName}_\${DATE}.sql"

echo "Starting backup of ${dbName} at $(date)"
pg_dump -h ${dbHost} -p 5432 -U ${dbUser} -d ${dbName} ${backupConfig.pointInTimeRecovery ? '--wal-method=fetch' : ''} > "\${BACKUP_FILE}"
${backupConfig.encryption ? 'gpg --symmetric --cipher-algo AES256 "${BACKUP_FILE}" && rm "${BACKUP_FILE}"' : ''}
echo "Backup completed: \${BACKUP_FILE}${backupConfig.encryption ? '.gpg' : ''}"

# Cleanup old backups
find \${BACKUP_DIR} -name "${dbName}_*.sql*" -mtime +${backupConfig.retentionDays} -delete
echo "Cleanup completed"
`;
    }

    return configs;
}
