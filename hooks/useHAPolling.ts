"use client"

import { useEffect, useCallback, useRef } from 'react';
import { getHAStatus, getPoolMetrics, listBackups, type HAStatusResponse, type PoolMetrics } from "@/actions/databaseHA";
import { useHAStore } from "@/store/ha";

export interface HAPollingOptions {
    composeId: string;
    enabled?: boolean;
    statusInterval?: number;      // ms - default 10s
    metricsInterval?: number;     // ms - default 10s
    backupsInterval?: number;     // ms - default 30s
    onStatusChange?: (status: HAStatusResponse) => void;
    onMetricsChange?: (metrics: PoolMetrics) => void;
    onError?: (error: Error, type: 'status' | 'metrics' | 'backups') => void;
}

export function useHAPolling({
    composeId,
    enabled = true,
    statusInterval = 10000,
    metricsInterval = 10000,
    backupsInterval = 30000,
    onStatusChange,
    onMetricsChange,
    onError
}: HAPollingOptions) {
    const { setHAStatus, setPoolMetrics, addBackup, startPolling, stopPolling, isPolling } = useHAStore();
    const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const backupsIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const mountedRef = useRef(true);

    const fetchStatus = useCallback(async () => {
        if (!mountedRef.current || !enabled) return;
        
        try {
            const result = await getHAStatus(composeId);
            if (!mountedRef.current) return;
            
            if ('error' in result) {
                onError?.(new Error(result.error), 'status');
                return;
            }
            
            setHAStatus(composeId, result);
            onStatusChange?.(result);
        } catch (error) {
            if (mountedRef.current) {
                onError?.(error as Error, 'status');
            }
        }
    }, [composeId, enabled, setHAStatus, onStatusChange, onError]);

    const fetchMetrics = useCallback(async () => {
        if (!mountedRef.current || !enabled) return;
        
        try {
            const result = await getPoolMetrics(composeId);
            if (!mountedRef.current) return;
            
            if ('error' in result) {
                // Don't treat as error - PgBouncer might not be deployed
                return;
            }
            
            const metrics: PoolMetrics = {
                totalConnections: result.totalConnections || 0,
                activeConnections: result.activeConnections || 0,
                idleConnections: result.idleConnections || 0,
                waitingConnections: result.waitingConnections || 0,
                maxConnections: result.maxConnections || 1000,
                poolSize: result.poolSize || 25,
                minPoolSize: result.minPoolSize || 5,
                reservePoolSize: result.reservePoolSize || 5,
                avgQueryTime: result.avgQueryTime || 0,
                queriesPerSecond: result.queriesPerSecond || 0,
                cacheHitRatio: result.cacheHitRatio || 0,
                serverLifetime: result.serverLifetime || 3600,
                serverIdleTimeout: result.serverIdleTimeout || 600,
                lastUpdated: new Date()
            };
            
            setPoolMetrics(composeId, metrics);
            onMetricsChange?.(metrics);
        } catch (error) {
            if (mountedRef.current) {
                onError?.(error as Error, 'metrics');
            }
        }
    }, [composeId, enabled, setPoolMetrics, onMetricsChange, onError]);

    const fetchBackups = useCallback(async () => {
        if (!mountedRef.current || !enabled) return;
        
        try {
            const result = await listBackups(composeId);
            if (!mountedRef.current) return;
            
            if (Array.isArray(result)) {
                result.forEach(backup => {
                    addBackup(composeId, backup);
                });
            }
        } catch (error) {
            if (mountedRef.current) {
                onError?.(error as Error, 'backups');
            }
        }
    }, [composeId, enabled, addBackup, onError]);

    // Start/stop polling based on enabled
    useEffect(() => {
        if (!enabled) {
            // Stop all polling
            if (statusIntervalRef.current) {
                clearInterval(statusIntervalRef.current);
                statusIntervalRef.current = null;
            }
            if (metricsIntervalRef.current) {
                clearInterval(metricsIntervalRef.current);
                metricsIntervalRef.current = null;
            }
            if (backupsIntervalRef.current) {
                clearInterval(backupsIntervalRef.current);
                backupsIntervalRef.current = null;
            }
            stopPolling(composeId);
            return;
        }

        // Initial fetch
        fetchStatus();
        fetchMetrics();
        fetchBackups();

        // Start intervals
        startPolling(composeId);
        
        statusIntervalRef.current = setInterval(fetchStatus, statusInterval);
        metricsIntervalRef.current = setInterval(fetchMetrics, metricsInterval);
        backupsIntervalRef.current = setInterval(fetchBackups, backupsInterval);

        // Cleanup
        return () => {
            if (statusIntervalRef.current) {
                clearInterval(statusIntervalRef.current);
                statusIntervalRef.current = null;
            }
            if (metricsIntervalRef.current) {
                clearInterval(metricsIntervalRef.current);
                metricsIntervalRef.current = null;
            }
            if (backupsIntervalRef.current) {
                clearInterval(backupsIntervalRef.current);
                backupsIntervalRef.current = null;
            }
            stopPolling(composeId);
        };
    }, [enabled, composeId, statusInterval, metricsInterval, backupsInterval, fetchStatus, fetchMetrics, fetchBackups, startPolling, stopPolling]);

    // Track mounted state
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Manual refresh function
    const refresh = useCallback(async () => {
        await Promise.all([
            fetchStatus(),
            fetchMetrics(),
            fetchBackups()
        ]);
    }, [fetchStatus, fetchMetrics, fetchBackups]);

    return {
        refresh,
        isPolling: isPolling[composeId] || false
    };
}

// Hook for single-shot status fetch (useful for initial load)
export function useHAStatus(composeId: string) {
    const { getHAStatus, isPolling } = useHAStore();
    
    const status = getHAStatus(composeId);
    
    return {
        status,
        isPolling: isPolling[composeId] || false
    };
}

// Hook for pool metrics
export function usePoolMetrics(composeId: string) {
    const { getPoolMetrics, isPolling } = useHAStore();
    
    const metrics = getPoolMetrics(composeId);
    
    return {
        metrics,
        isPolling: isPolling[composeId] || false
    };
}

// Hook for failover events
export function useFailoverEvents(composeId: string) {
    const { getFailoverEvents } = useHAStore();
    
    const events = getFailoverEvents(composeId);
    
    return { events };
}

// Hook for backups
export function useBackups(composeId: string) {
    const { getBackups, addBackup, updateBackup } = useHAStore();
    
    const backups = getBackups(composeId);
    
    return { backups, addBackup, updateBackup };
}

// Hook for cluster health badge
export function useClusterHealth(composeId: string) {
    const { getClusterHealth, getHAStatus: getStatus } = useHAStore();
    
    const health = getClusterHealth(composeId);
    const status = getStatus(composeId);
    
    const healthConfig = {
        healthy: { label: 'Healthy', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: '✅' },
        degraded: { label: 'Degraded', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: '⚠️' },
        critical: { label: 'Critical', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: '🔴' },
        unknown: { label: 'Unknown', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', icon: '❓' }
    };
    
    const config = healthConfig[health];
    
    return {
        health,
        status,
        label: config.label,
        color: config.color,
        bg: config.bg,
        border: config.border,
        icon: config.icon,
        primary: status?.primary,
        replicas: status?.replicas || [],
        pool: status?.connectionPool,
        loadBalancer: status?.loadBalancer,
        lastFailover: status?.lastFailover,
        updatedAt: status?.updatedAt
    };
}
