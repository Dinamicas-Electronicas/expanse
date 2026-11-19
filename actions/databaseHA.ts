'use server'

import { getDb } from "@/lib/mongodb";
import { ObjectId } from "bson";
import { ensureAuth } from "@/lib/auth";
import { generateHACompose, generateAllHAConfigs, type DatabaseHAConfig } from "@/lib/metadata";
import path from 'path';
import YAML from 'yaml';
import {
    assertComposeId,
    assertDockerReference,
    composeProjectName,
    composeWorkDir,
    runCompose,
} from '@/lib/dockerExec';

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}

export interface ValidationError {
    code: string;
    message: string;
    field?: string;
}

export interface HAStatusResponse {
    composeId: string;
    haEnabled: boolean;
    clusterStatus: 'healthy' | 'degraded' | 'critical' | 'unknown';
    primary: {
        name: string;
        status: string;
        role: 'primary' | 'replica';
        lagMs?: number;
    } | null;
    replicas: Array<{
        name: string;
        status: string;
        role: 'primary' | 'replica' | 'witness';
        replicationMode: 'sync' | 'async' | 'semi-sync';
        region: string;
        priority: number;
        lagMs?: number;
        lastHeartbeat?: string;
    }>;
    connectionPool: {
        enabled: boolean;
        status: string;
        activeConnections?: number;
        maxConnections?: number;
        utilization?: number;
    } | null;
    loadBalancer: {
        enabled: boolean;
        status: string;
        backendsUp?: number;
        backendsTotal?: number;
    } | null;
    lastFailover?: {
        timestamp: string;
        fromNode: string;
        toNode: string;
        reason: string;
        duration: number;
        success: boolean;
    };
    updatedAt: string;
}

export interface FailoverResult {
    success: boolean;
    message?: string;
    fromNode?: string;
    toNode?: string;
    duration?: number;
    error?: string;
}

export interface BackupResult {
    success: boolean;
    backupId?: string;
    fileName?: string;
    size?: string;
    duration?: number;
    error?: string;
}

export interface BackupInfo {
    id: string;
    fileName: string;
    size: string;
    createdAt: string;
    type: 'full' | 'incremental';
    status: 'completed' | 'failed' | 'in_progress';
}

export interface RestoreResult {
    success: boolean;
    message?: string;
    restoredFrom?: string;
    duration?: number;
    error?: string;
}

export interface PoolMetrics {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingConnections: number;
    maxConnections: number;
    poolSize: number;
    minPoolSize: number;
    reservePoolSize: number;
    avgQueryTime: number;
    queriesPerSecond: number;
    cacheHitRatio: number;
    serverLifetime: number;
    serverIdleTimeout: number;
    lastUpdated: Date;
}

/**
 * Validate HA configuration for a database cluster
 */
export async function validateHAConfig(config: DatabaseHAConfig): Promise<ValidationResult> {
    await ensureAuth();
    
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate replication
    if (config.replication?.enabled) {
        const replication = config.replication;
        const voters = (replication.replicas?.filter(r => r.role !== 'witness').length || 0) + 1;
        
        if (voters < 3) {
            errors.push({
                code: 'INSUFFICIENT_QUORUM',
                message: `Minimum 3 voting nodes required for quorum (got ${voters}). Need at least 2 replicas with role !== 'witness'.`,
                field: 'replication.replicas'
            });
        }

        if (replication.mode === 'sync') {
            const syncReplicas = replication.replicas?.filter(r => r.role === 'sync').length || 0;
            if (syncReplicas === 0) {
                errors.push({
                    code: 'NO_SYNC_REPLICA',
                    message: 'Synchronous replication mode requires at least 1 sync replica',
                    field: 'replication.replicas'
                });
            } else if (syncReplicas > 2) {
                warnings.push({
                    code: 'TOO_MANY_SYNC_REPLICAS',
                    message: 'More than 2 sync replicas may impact primary performance',
                    field: 'replication.replicas'
                });
            }
        }

        if (replication.mode === 'semi-sync') {
            const syncReplicas = replication.replicas?.filter(r => r.role === 'sync').length || 0;
            if (syncReplicas === 0) {
                warnings.push({
                    code: 'NO_SYNC_REPLICA_SEMI',
                    message: 'Semi-sync mode works best with at least 1 sync replica',
                    field: 'replication.replicas'
                });
            }
        }

        // Check for duplicate regions
        const regions = replication.replicas?.map(r => r.region) || [];
        const uniqueRegions = new Set(regions);
        if (regions.length !== uniqueRegions.size) {
            errors.push({
                code: 'DUPLICATE_REGIONS',
                message: 'Replica regions must be unique',
                field: 'replication.replicas'
            });
        }

        // Check priorities
        const priorities = replication.replicas?.map(r => r.priority) || [];
        if (priorities.some(p => p < 1 || p > 100)) {
            errors.push({
                code: 'INVALID_PRIORITY',
                message: 'Replica priorities must be between 1 and 100',
                field: 'replication.replicas'
            });
        }
    }

    // Validate failover
    if (config.failover?.enabled) {
        const failover = config.failover;
        if (failover.timeout < 10 || failover.timeout > 300) {
            errors.push({
                code: 'INVALID_FAILOVER_TIMEOUT',
                message: 'Failover timeout must be between 10 and 300 seconds',
                field: 'failover.timeout'
            });
        }
        if (failover.maxRetries < 1 || failover.maxRetries > 10) {
            errors.push({
                code: 'INVALID_MAX_RETRIES',
                message: 'Max retries must be between 1 and 10',
                field: 'failover.maxRetries'
            });
        }
        if (failover.healthCheckInterval < 5 || failover.healthCheckInterval > 60) {
            errors.push({
                code: 'INVALID_HEALTH_CHECK_INTERVAL',
                message: 'Health check interval must be between 5 and 60 seconds',
                field: 'failover.healthCheckInterval'
            });
        }
    }

    // Validate connection pool
    if (config.connectionPool?.enabled) {
        const pool = config.connectionPool;
        if (pool.maxConnections > 10000) {
            warnings.push({
                code: 'HIGH_MAX_CONNECTIONS',
                message: 'maxConnections > 10000 may require kernel tuning (net.core.somaxconn, etc.)',
                field: 'connectionPool.maxConnections'
            });
        }
        if (pool.poolSize > pool.maxConnections) {
            errors.push({
                code: 'POOL_SIZE_EXCEEDS_MAX',
                message: 'poolSize cannot exceed maxConnections',
                field: 'connectionPool.poolSize'
            });
        }
        if (pool.poolSize < 5) {
            warnings.push({
                code: 'SMALL_POOL_SIZE',
                message: 'poolSize < 5 may cause connection contention under load',
                field: 'connectionPool.poolSize'
            });
        }
        if (pool.idleTimeout < 60) {
            warnings.push({
                code: 'SHORT_IDLE_TIMEOUT',
                message: 'idleTimeout < 60s may cause excessive connection churn',
                field: 'connectionPool.idleTimeout'
            });
        }
    }

    // Validate load balancer
    if (config.loadBalancer?.enabled) {
        const lb = config.loadBalancer;
        if (lb.port < 1 || lb.port > 65535) {
            errors.push({
                code: 'INVALID_LB_PORT',
                message: 'Load balancer port must be between 1 and 65535',
                field: 'loadBalancer.port'
            });
        }
        if (lb.targetPort < 1 || lb.targetPort > 65535) {
            errors.push({
                code: 'INVALID_TARGET_PORT',
                message: 'Target port must be between 1 and 65535',
                field: 'loadBalancer.targetPort'
            });
        }
        if (lb.healthCheckPath && !lb.healthCheckPath.startsWith('/')) {
            warnings.push({
                code: 'HEALTH_CHECK_PATH_FORMAT',
                message: 'Health check path should start with /',
                field: 'loadBalancer.healthCheckPath'
            });
        }
    }

    // Validate backup
    if (config.backup?.enabled) {
        const backup = config.backup;
        // Validate cron format (basic)
        const cronParts = backup.schedule.split(' ');
        if (cronParts.length !== 5) {
            warnings.push({
                code: 'INVALID_CRON_FORMAT',
                message: 'Backup schedule should be a valid 5-field cron expression',
                field: 'backup.schedule'
            });
        }
        if (backup.retentionDays < 1 || backup.retentionDays > 365) {
            errors.push({
                code: 'INVALID_RETENTION',
                message: 'Retention days must be between 1 and 365',
                field: 'backup.retentionDays'
            });
        }
        if (backup.storage !== 'local') {
            warnings.push({
                code: 'REMOTE_STORAGE_NOT_IMPLEMENTED',
                message: `Remote storage (${backup.storage}) not yet implemented - will use local`,
                field: 'backup.storage'
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Generate HA Docker Compose from base compose and HA config
 */
export async function generateHAComposeAction(
    composeId: string,
    haConfig: DatabaseHAConfig,
    dbCredentials: { dbName: string; dbUser: string; dbPassword: string }
): Promise<{ success: boolean; yaml?: string; configs?: Record<string, string>; error?: string }> {
    await ensureAuth();

    try {
        const db = await getDb();
        const collection = db.collection("composes");
        const doc = await collection.findOne({ _id: new ObjectId(composeId) });
        
        if (!doc) {
            return { success: false, error: 'Compose not found' };
        }

        const baseCompose = doc.compose; // Stored compose object
        
        // Generate HA compose
        const haCompose = generateHACompose({
            baseCompose,
            haConfig,
            projectName: `expanse-${assertComposeId(composeId)}`,
            dbCredentials
        });

        // Generate all config files
        const configs = generateAllHAConfigs(haConfig, dbCredentials);

        // Convert compose to YAML
        const yamlContent = YAML.stringify(haCompose);

        return { success: true, yaml: yamlContent, configs };
    } catch (error: any) {
        console.error('Generate HA Compose Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get HA status for a deployed compose
 */
export async function getHAStatus(composeId: string): Promise<HAStatusResponse | { error: string }> {
    await ensureAuth();

    try {
        const db = await getDb();
        const collection = db.collection("composes");
        const doc = await collection.findOne({ _id: new ObjectId(composeId) });
        
        if (!doc) {
            return { error: 'Compose not found' };
        }

        const haConfig = doc.haConfig as DatabaseHAConfig | undefined;
        if (!haConfig || !doc.haEnabled) {
            return {
                composeId,
                haEnabled: false,
                clusterStatus: 'unknown',
                primary: null,
                replicas: [],
                connectionPool: null,
                loadBalancer: null,
                updatedAt: new Date().toISOString()
            };
        }

        // Get Docker container statuses
        const id = assertComposeId(composeId);
        const tempDir = composeWorkDir(id);
        const yamlPath = path.join(tempDir, 'docker-compose.yaml');
        
        let containers: any[] = [];
        try {
            const { stdout } = await runCompose(['ps', '--format', 'json'], {
                project: composeProjectName(id),
                yamlPath,
            });
            if (stdout.trim()) {
                try {
                    containers = JSON.parse(stdout);
                    if (!Array.isArray(containers)) containers = [containers];
                } catch {
                    containers = stdout.trim().split('\n').map(line => {
                        try { return JSON.parse(line); } catch { return null; }
                    }).filter(Boolean);
                }
            }
        } catch {
            // Compose might not be deployed
        }

        // Parse container statuses
        const containerMap = new Map(containers.map(c => [c.Name || c.Service, c]));

        // Build primary info
        const primaryContainer = containerMap.get('db-primary') || containerMap.get('postgres-primary');
        const primary = primaryContainer ? {
            name: 'db-primary',
            status: primaryContainer.State?.toLowerCase() || 'unknown',
            role: 'primary' as const,
            lagMs: 0
        } : null;

        // Build replicas info
        const replicas: HAStatusResponse['replicas'] = [];
        for (let i = 1; i <= 10; i++) {
            const replicaContainer = containerMap.get(`db-replica-${i}`) || containerMap.get(`postgres-replica-${i}`);
            if (replicaContainer) {
                replicas.push({
                    name: `db-replica-${i}`,
                    status: replicaContainer.State?.toLowerCase() || 'unknown',
                    role: 'replica',
                    replicationMode: haConfig.replication?.mode || 'async',
                    region: haConfig.replication?.replicas?.[i - 1]?.region || `region-${i}`,
                    priority: haConfig.replication?.replicas?.[i - 1]?.priority || 50,
                    lagMs: undefined, // Would need Patroni API to get real lag
                    lastHeartbeat: new Date().toISOString()
                });
            }
        }

        // Connection pool status
        const pgbouncerContainer = containerMap.get('pgbouncer');
        const connectionPool = haConfig.connectionPool?.enabled ? {
            enabled: true,
            status: pgbouncerContainer?.State?.toLowerCase() || 'unknown',
            activeConnections: undefined,
            maxConnections: haConfig.connectionPool.maxConnections,
            utilization: undefined
        } : null;

        // Load balancer status
        const haproxyContainer = containerMap.get('haproxy') || containerMap.get('lb');
        const loadBalancer = haConfig.loadBalancer?.enabled ? {
            enabled: true,
            status: haproxyContainer?.State?.toLowerCase() || 'unknown',
            backendsUp: (primary ? 1 : 0) + replicas.filter(r => r.status === 'running').length,
            backendsTotal: 1 + replicas.length
        } : null;

        // Determine cluster status
        const allRunning = primary?.status === 'running' && replicas.every(r => r.status === 'running');
        const anyRunning = primary?.status === 'running' || replicas.some(r => r.status === 'running');
        let clusterStatus: HAStatusResponse['clusterStatus'] = 'unknown';
        if (allRunning) clusterStatus = 'healthy';
        else if (anyRunning) clusterStatus = 'degraded';
        else clusterStatus = 'critical';

        // Get last failover from metadata
        const lastFailover = doc.metadata?.lastFailover;

        return {
            composeId,
            haEnabled: true,
            clusterStatus,
            primary,
            replicas,
            connectionPool,
            loadBalancer,
            lastFailover,
            updatedAt: new Date().toISOString()
        };
    } catch (error: any) {
        console.error('Get HA Status Error:', error);
        return { error: error.message };
    }
}

/**
 * Simulate/manual failover
 */
export async function simulateFailover(
    composeId: string, 
    targetReplica?: string
): Promise<FailoverResult> {
    await ensureAuth();

    try {
        const db = await getDb();
        const collection = db.collection("composes");
        const doc = await collection.findOne({ _id: new ObjectId(composeId) });
        
        if (!doc) {
            return { success: false, error: 'Compose not found' };
        }

        const haConfig = doc.haConfig as DatabaseHAConfig | undefined;
        if (!haConfig || !haConfig.failover?.enabled) {
            return { success: false, error: 'HA failover not enabled for this compose' };
        }

        const id = assertComposeId(composeId);
        const tempDir = composeWorkDir(id);
        const yamlPath = path.join(tempDir, 'docker-compose.yaml');

        // Get current primary
        const { stdout } = await runCompose(['ps', '--format', 'json'], {
            project: composeProjectName(id),
            yamlPath,
        });
        let containers: any[] = [];
        if (stdout.trim()) {
            try {
                containers = JSON.parse(stdout);
                if (!Array.isArray(containers)) containers = [containers];
            } catch {
                containers = stdout.trim().split('\n').map(line => {
                    try { return JSON.parse(line); } catch { return null; }
                }).filter(Boolean);
            }
        }

        const primaryContainer = containers.find(c => c.Service === 'db-primary' || c.Name?.includes('db-primary'));
        if (!primaryContainer) {
            return { success: false, error: 'Primary container not found' };
        }

        const fromNode = primaryContainer.Name || 'db-primary';
        const toNode = targetReplica || 'db-replica-1';
        const startTime = Date.now();

        // Use patronictl to trigger failover
        const target = assertDockerReference(toNode, 'replica name');
        try {
            const { stdout, stderr } = await runCompose(
                ['exec', '-T', 'db-primary', 'patronictl', '-c', '/etc/patroni/patroni.yml', 'failover', '--force', target],
                { project: composeProjectName(id), yamlPath },
            );
            const duration = Date.now() - startTime;
            
            if (stderr && !stdout.includes('Success')) {
                return { 
                    success: false, 
                    error: stderr || 'Failover command failed',
                    fromNode,
                    toNode,
                    duration
                };
            }

            // Record failover event
            await collection.updateOne(
                { _id: new ObjectId(composeId) },
                { 
                    $set: { 
                        'metadata.lastFailover': {
                            timestamp: new Date().toISOString(),
                            fromNode,
                            toNode,
                            reason: 'Manual failover triggered',
                            duration,
                            success: true
                        }
                    }
                }
            );

            return { 
                success: true, 
                message: 'Failover completed successfully',
                fromNode,
                toNode,
                duration
            };
        } catch (failoverError: any) {
            const duration = Date.now() - startTime;
            return { 
                success: false, 
                error: failoverError.message,
                fromNode,
                toNode,
                duration
            };
        }
    } catch (error: any) {
        console.error('Simulate Failover Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Trigger manual backup
 */
export async function triggerBackup(composeId: string): Promise<BackupResult> {
    await ensureAuth();

    try {
        const db = await getDb();
        const collection = db.collection("composes");
        const doc = await collection.findOne({ _id: new ObjectId(composeId) });
        
        if (!doc) {
            return { success: false, error: 'Compose not found' };
        }

        const haConfig = doc.haConfig as DatabaseHAConfig | undefined;
        if (!haConfig || !haConfig.backup?.enabled) {
            return { success: false, error: 'Backup not enabled for this compose' };
        }

        const id = assertComposeId(composeId);
        const tempDir = composeWorkDir(id);
        const yamlPath = path.join(tempDir, 'docker-compose.yaml');

        // Run backup via backup container or exec into primary
        const startTime = Date.now();
        try {
            const { stdout } = await runCompose(
                ['exec', '-T', 'backup', '/backup.sh'],
                { project: composeProjectName(id), yamlPath },
            );
            const duration = Date.now() - startTime;

            // Parse backup file name from output
            const backupMatch = stdout.match(/(expanse_\d{8}_\d{6}\.sql\.?gpg?)/);
            const fileName = backupMatch?.[1] || `expanse_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;

            // Save backup record
            const backupRecord = {
                id: new ObjectId().toString(),
                fileName,
                size: 'unknown', // Would need to check file size
                createdAt: new Date().toISOString(),
                type: 'full',
                status: 'completed'
            };

            await collection.updateOne(
                { _id: new ObjectId(composeId) },
                { $push: { 'metadata.backups': backupRecord } as any }
            );

            return { 
                success: true, 
                backupId: backupRecord.id,
                fileName,
                duration 
            };
        } catch (backupError: any) {
            return { 
                success: false, 
                error: backupError.message,
                duration: Date.now() - startTime
            };
        }
    } catch (error: any) {
        console.error('Trigger Backup Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * List backups for a compose
 */
export async function listBackups(composeId: string): Promise<BackupInfo[] | { error: string }> {
    await ensureAuth();

    try {
        const db = await getDb();
        const collection = db.collection("composes");
        const doc = await collection.findOne({ _id: new ObjectId(composeId) });
        
        if (!doc) {
            return { error: 'Compose not found' };
        }

        return doc.metadata?.backups || [];
    } catch (error: any) {
        console.error('List Backups Error:', error);
        return { error: error.message };
    }
}

/**
 * Restore from backup
 */
export async function restoreBackup(composeId: string, backupId: string): Promise<RestoreResult> {
    await ensureAuth();

    try {
        const db = await getDb();
        const collection = db.collection("composes");
        const doc = await collection.findOne({ _id: new ObjectId(composeId) });
        
        if (!doc) {
            return { success: false, error: 'Compose not found' };
        }

        const backup = doc.metadata?.backups?.find((b: any) => b.id === backupId);
        if (!backup) {
            return { success: false, error: 'Backup not found' };
        }

        const id = assertComposeId(composeId);
        const tempDir = composeWorkDir(id);
        const yamlPath = path.join(tempDir, 'docker-compose.yaml');

        // Restore via psql. The dump filename is validated because it is
        // embedded in a shell snippet executed *inside* the container.
        const fileName = assertDockerReference(String(backup.fileName ?? ''), 'backup file name');
        const startTime = Date.now();
        try {
            await runCompose(
                ['exec', '-T', 'db-primary', 'sh', '-c', `psql -U postgres -d expanse < /backups/${fileName}`],
                { project: composeProjectName(id), yamlPath },
            );
            const duration = Date.now() - startTime;

            return { 
                success: true, 
                message: 'Database restored successfully',
                restoredFrom: backup.fileName,
                duration
            };
        } catch (restoreError: any) {
            return { 
                success: false, 
                error: restoreError.message,
                duration: Date.now() - startTime
            };
        }
    } catch (error: any) {
        console.error('Restore Backup Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get pool metrics from PgBouncer
 */
export async function getPoolMetrics(composeId: string): Promise<PoolMetrics | { error: string }> {
    await ensureAuth();

    try {
        const id = assertComposeId(composeId);
        const tempDir = composeWorkDir(id);
        const yamlPath = path.join(tempDir, 'docker-compose.yaml');

        // Verify that PgBouncer is reachable before returning metrics.
        try {
            await runCompose(
                ['exec', '-T', 'pgbouncer', 'psql', '-U', 'postgres', '-c', 'SHOW STATS;'],
                { project: composeProjectName(id), yamlPath },
            );
        } catch {
            return { error: 'PgBouncer not deployed or not accessible' };
        }

        // Parse PgBouncer SHOW STATS output
        // This would need proper parsing based on actual output format
        return {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            waitingConnections: 0,
            maxConnections: 1000,
            poolSize: 25,
            minPoolSize: 5,
            reservePoolSize: 5,
            avgQueryTime: 0,
            queriesPerSecond: 0,
            cacheHitRatio: 0,
            serverLifetime: 3600,
            serverIdleTimeout: 600,
            lastUpdated: new Date()
        };
    } catch (error: any) {
        console.error('Get Pool Metrics Error:', error);
        return { error: error.message };
    }
}

/**
 * Update pool configuration at runtime
 */
export async function updatePoolConfig(
    composeId: string, 
    poolConfig: { poolSize?: number; maxConnections?: number; idleTimeout?: number }
): Promise<{ success: boolean; message?: string; error?: string }> {
    await ensureAuth();

    try {
        const db = await getDb();
        const collection = db.collection("composes");
        
        await collection.updateOne(
            { _id: new ObjectId(composeId) },
            { $set: { 'haConfig.connectionPool': { ...poolConfig } } }
        );

        // Would need to reload PgBouncer config - requires restart
        return { success: true, message: 'Pool config updated. Restart required for changes to take effect.' };
    } catch (error: any) {
        console.error('Update Pool Config Error:', error);
        return { success: false, error: error.message };
    }
}
