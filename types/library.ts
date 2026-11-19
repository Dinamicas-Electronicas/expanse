export type LoadBalancerType = 'haproxy' | 'nginx' | 'traefik';
export type LoadBalancerAlgorithm = 'round-robin' | 'least-connections' | 'ip-hash';
export type PoolMode = 'transaction' | 'session' | 'statement';
export type DatabaseHaType = 'single' | 'pgbouncer' | 'patroni' | 'galera' | 'innodb-cluster' | 'replica-set' | 'sentinel' | 'raft';

export interface LoadBalancerConfig {
    type: LoadBalancerType;
    port: number;
    targetPort: number;
    algorithm: LoadBalancerAlgorithm;
    healthCheckPath: string;
    healthCheckInterval?: string;
}

export interface ReplicasConfig {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    scaleTarget?: string;
    targetCPUUtilization?: number;
    targetMemoryUtilization?: number;
}

// Legacy simple HA config (used by existing templates like postgrest-ha.json)
export interface DatabaseHaConfig {
    type: DatabaseHaType;
    poolMode?: PoolMode;
    maxConnections?: number;
    poolSize?: number;
}

export interface WebFrontendConfig {
    hasWebUI: boolean;
    internalPort: number;
    basePath: string;
    healthCheckPath?: string;
    startupTimeEstimate?: number;
    icon?: string;
    displayName?: string;
    requiresHttps?: boolean;
}

export interface ReplicationConfig {
    enabled: boolean;
    mode: 'async' | 'sync' | 'semi-sync';
    primaryRegion: string;
    replicas: Array<{
        region: string;
        role: 'sync' | 'async' | 'witness';
        priority: number;
    }>;
}

export interface FailoverConfig {
    enabled: boolean;
    timeout: number;
    maxRetries: number;
    healthCheckInterval: number;
    promotionPolicy: 'priority' | 'latency' | 'manual';
}

export interface ConnectionPoolConfig {
    enabled: boolean;
    type: 'pgbouncer' | 'proxysql' | 'haproxy';
    mode: PoolMode;
    poolSize: number;
    maxConnections: number;
    idleTimeout: number;
}

export interface LoadBalancerConfigExtended {
    enabled: boolean;
    type: 'haproxy' | 'nginx' | 'envoy';
    algorithm: LoadBalancerAlgorithm;
    healthCheckPath: string;
    stickySessions: boolean;
    port: number;
    targetPort: number;
}

export interface BackupConfig {
    enabled: boolean;
    schedule: string;
    retentionDays: number;
    storage: 'local' | 's3' | 'gcs' | 'azure';
    encryption: boolean;
    pointInTimeRecovery: boolean;
}

// New comprehensive HA config (for full HA database clusters)
export interface DatabaseHAConfig {
    replication?: ReplicationConfig;
    failover?: FailoverConfig;
    connectionPool?: ConnectionPoolConfig;
    loadBalancer?: LoadBalancerConfigExtended;
    backup?: BackupConfig;
}

export interface TemplateService {
    name: string;
    image: string;
    category: 'Database' | 'Web Server' | 'Cache' | 'Queue' | 'Other' | 'Applications' | 'Monitoring' | 'OS' | 'Development' | 'Messaging' | 'Network' | 'Cloud' | 'CMS' | 'Social' | 'AI' | 'Automation' | 'Utilities';
    logo?: string;
    description?: string;
    default_ports?: string[];
    env_vars?: Record<string, string>;
    volumes?: string[];
    command?: string | string[];
    isStack?: boolean;
    related_services?: TemplateService[];
    loadBalancer?: LoadBalancerConfig;
    replicas?: ReplicasConfig;
    databaseHa?: DatabaseHaConfig;        // Legacy simple config
    databaseHA?: DatabaseHAConfig;        // New comprehensive config
    haEnabled?: boolean;
    webFrontend?: WebFrontendConfig;
}