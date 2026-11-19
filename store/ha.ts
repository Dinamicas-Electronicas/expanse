"use client"

import { create } from 'zustand';
import { DatabaseHAConfig } from "@/types/library";

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

export interface FailoverEvent {
    id: string;
    timestamp: Date;
    type: 'automatic' | 'manual' | 'promotion' | 'demotion' | 'split-brain';
    fromNode: string;
    toNode: string;
    reason: string;
    duration: number;
    success: boolean;
    details?: string;
}

export interface BackupInfo {
    id: string;
    fileName: string;
    size: string;
    createdAt: string;
    type: 'full' | 'incremental';
    status: 'completed' | 'failed' | 'in_progress';
}

interface HAState {
    // Config per compose
    configs: Record<string, DatabaseHAConfig>;
    
    // Runtime status
    status: Record<string, HAStatusResponse>;
    
    // Metrics
    poolMetrics: Record<string, PoolMetrics>;
    
    // Events
    failoverEvents: Record<string, FailoverEvent[]>;
    backups: Record<string, BackupInfo[]>;
    
    // Polling control
    pollingIntervals: Record<string, NodeJS.Timeout>;
    isPolling: Record<string, boolean>;
    
    // Actions
    setHAConfig: (composeId: string, config: DatabaseHAConfig) => void;
    getHAConfig: (composeId: string) => DatabaseHAConfig | undefined;
    clearHAConfig: (composeId: string) => void;
    
    // Status
    setHAStatus: (composeId: string, status: HAStatusResponse) => void;
    getHAStatus: (composeId: string) => HAStatusResponse | undefined;
    
    // Pool metrics
    setPoolMetrics: (composeId: string, metrics: PoolMetrics) => void;
    getPoolMetrics: (composeId: string) => PoolMetrics | undefined;
    
    // Failover events
    addFailoverEvent: (composeId: string, event: FailoverEvent) => void;
    getFailoverEvents: (composeId: string) => FailoverEvent[];
    clearFailoverEvents: (composeId: string) => void;
    
    // Backups
    addBackup: (composeId: string, backup: BackupInfo) => void;
    updateBackup: (composeId: string, backupId: string, updates: Partial<BackupInfo>) => void;
    getBackups: (composeId: string) => BackupInfo[];
    clearBackups: (composeId: string) => void;
    
    // Polling
    startPolling: (composeId: string, intervalMs?: number) => void;
    stopPolling: (composeId: string) => void;
    stopAllPolling: () => void;
    
    // Helpers
    hasHAEnabled: (composeId: string) => boolean;
    getClusterHealth: (composeId: string) => 'healthy' | 'degraded' | 'critical' | 'unknown';
}

export const useHAStore = create<HAState>((set, get) => ({
    // Initial state
    configs: {},
    status: {},
    poolMetrics: {},
    failoverEvents: {},
    backups: {},
    pollingIntervals: {},
    isPolling: {},

    // Config actions
    setHAConfig: (composeId: string, config: DatabaseHAConfig) => {
        set((state) => ({
            configs: { ...state.configs, [composeId]: config }
        }));
    },

    getHAConfig: (composeId: string) => {
        return get().configs[composeId];
    },

    clearHAConfig: (composeId: string) => {
        set((state) => {
            const newConfigs = { ...state.configs };
            delete newConfigs[composeId];
            return { configs: newConfigs };
        });
    },

    // Status actions
    setHAStatus: (composeId: string, status: HAStatusResponse) => {
        set((state) => ({
            status: { ...state.status, [composeId]: status }
        }));
    },

    getHAStatus: (composeId: string) => {
        return get().status[composeId];
    },

    // Pool metrics actions
    setPoolMetrics: (composeId: string, metrics: PoolMetrics) => {
        set((state) => ({
            poolMetrics: { ...state.poolMetrics, [composeId]: metrics }
        }));
    },

    getPoolMetrics: (composeId: string) => {
        return get().poolMetrics[composeId];
    },

    // Failover events actions
    addFailoverEvent: (composeId: string, event: FailoverEvent) => {
        set((state) => {
            const existing = state.failoverEvents[composeId] || [];
            return {
                failoverEvents: {
                    ...state.failoverEvents,
                    [composeId]: [event, ...existing].slice(0, 100) // Keep last 100
                }
            };
        });
    },

    getFailoverEvents: (composeId: string) => {
        return get().failoverEvents[composeId] || [];
    },

    clearFailoverEvents: (composeId: string) => {
        set((state) => {
            const newEvents = { ...state.failoverEvents };
            delete newEvents[composeId];
            return { failoverEvents: newEvents };
        });
    },

    // Backups actions
    addBackup: (composeId: string, backup: BackupInfo) => {
        set((state) => {
            const existing = state.backups[composeId] || [];
            return {
                backups: {
                    ...state.backups,
                    [composeId]: [backup, ...existing].slice(0, 50) // Keep last 50
                }
            };
        });
    },

    updateBackup: (composeId: string, backupId: string, updates: Partial<BackupInfo>) => {
        set((state) => {
            const existing = state.backups[composeId] || [];
            return {
                backups: {
                    ...state.backups,
                    [composeId]: existing.map(b => b.id === backupId ? { ...b, ...updates } : b)
                }
            };
        });
    },

    getBackups: (composeId: string) => {
        return get().backups[composeId] || [];
    },

    clearBackups: (composeId: string) => {
        set((state) => {
            const newBackups = { ...state.backups };
            delete newBackups[composeId];
            return { backups: newBackups };
        });
    },

    // Polling actions
    startPolling: (composeId: string) => {
        const { isPolling } = get();
        
        // Don't start if already polling
        if (isPolling[composeId]) return;

        // Note: Actual polling is handled by React components via useEffect
        // This just tracks polling state
        set((state) => ({
            isPolling: { ...state.isPolling, [composeId]: true }
        }));
    },

    stopPolling: (composeId: string) => {
        const { pollingIntervals } = get();
        
        // Clear any existing interval
        const interval = pollingIntervals[composeId];
        if (interval) {
            clearInterval(interval);
        }

        set((state) => {
            const newIntervals = { ...state.pollingIntervals };
            delete newIntervals[composeId];
            return {
                pollingIntervals: newIntervals,
                isPolling: { ...state.isPolling, [composeId]: false }
            };
        });
    },

    stopAllPolling: () => {
        const { pollingIntervals } = get();
        Object.values(pollingIntervals).forEach(interval => clearInterval(interval));
        
        set({
            pollingIntervals: {},
            isPolling: {}
        });
    },

    // Helpers
    hasHAEnabled: (composeId: string) => {
        const config = get().configs[composeId];
        return config?.replication?.enabled === true || 
               config?.failover?.enabled === true || 
               config?.connectionPool?.enabled === true || 
               config?.loadBalancer?.enabled === true || 
               config?.backup?.enabled === true;
    },

    getClusterHealth: (composeId: string) => {
        const status = get().status[composeId];
        return status?.clusterStatus || 'unknown';
    }
}));

// Selector hooks for common use cases
export const useHAConfig = (composeId: string) => {
    return useHAStore((state) => state.getHAConfig(composeId));
};

export const useHAStatus = (composeId: string) => {
    return useHAStore((state) => state.getHAStatus(composeId));
};

export const usePoolMetrics = (composeId: string) => {
    return useHAStore((state) => state.getPoolMetrics(composeId));
};

export const useFailoverEvents = (composeId: string) => {
    return useHAStore((state) => state.getFailoverEvents(composeId));
};

export const useBackups = (composeId: string) => {
    return useHAStore((state) => state.getBackups(composeId));
};

export const useClusterHealth = (composeId: string) => {
    return useHAStore((state) => state.getClusterHealth(composeId));
};

export const useIsHAPolling = (composeId: string) => {
    return useHAStore((state) => state.isPolling[composeId] || false);
};

// Helper to create default HA config
export function createDefaultHAConfig(): DatabaseHAConfig {
    return {
        replication: {
            enabled: true,
            mode: 'async',
            primaryRegion: 'primary',
            replicas: [
                { region: 'replica-1', role: 'sync', priority: 100 },
                { region: 'replica-2', role: 'async', priority: 50 }
            ]
        },
        failover: {
            enabled: true,
            timeout: 30,
            maxRetries: 3,
            healthCheckInterval: 10,
            promotionPolicy: 'priority'
        },
        connectionPool: {
            enabled: true,
            type: 'pgbouncer',
            mode: 'transaction',
            poolSize: 25,
            maxConnections: 1000,
            idleTimeout: 600
        },
        loadBalancer: {
            enabled: true,
            type: 'haproxy',
            algorithm: 'round-robin',
            healthCheckPath: '/health',
            stickySessions: false,
            port: 5432,
            targetPort: 5432
        },
        backup: {
            enabled: true,
            schedule: '0 2 * * *',
            retentionDays: 7,
            storage: 'local',
            encryption: true,
            pointInTimeRecovery: true
        }
    };
}

// Helper to merge partial HA config
export function mergeHAConfig(
    base: DatabaseHAConfig, 
    partial: Partial<DatabaseHAConfig>
): DatabaseHAConfig {
    return {
        replication: partial.replication ? { ...base.replication, ...partial.replication } as DatabaseHAConfig['replication'] : base.replication,
        failover: partial.failover ? { ...base.failover, ...partial.failover } as DatabaseHAConfig['failover'] : base.failover,
        connectionPool: partial.connectionPool ? { ...base.connectionPool, ...partial.connectionPool } as DatabaseHAConfig['connectionPool'] : base.connectionPool,
        loadBalancer: partial.loadBalancer ? { ...base.loadBalancer, ...partial.loadBalancer } as DatabaseHAConfig['loadBalancer'] : base.loadBalancer,
        backup: partial.backup ? { ...base.backup, ...partial.backup } as DatabaseHAConfig['backup'] : base.backup
    };
}
