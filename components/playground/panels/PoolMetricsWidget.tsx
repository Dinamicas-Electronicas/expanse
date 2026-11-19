"use client"

import React from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Activity, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PoolMetrics {
    // Connection counts
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingConnections: number;
    
    // Pool configuration
    maxConnections: number;
    poolSize: number;
    minPoolSize: number;
    reservePoolSize: number;
    
    // Performance
    avgQueryTime: number; // ms
    queriesPerSecond: number;
    cacheHitRatio: number; // 0-1
    
    // Health
    serverLifetime: number; // seconds
    serverIdleTimeout: number; // seconds
    
    // Timestamps
    lastUpdated: Date;
}

interface PoolMetricsWidgetProps {
    metrics: PoolMetrics | null;
    compact?: boolean;
    showDetails?: boolean;
    refreshInterval?: number; // ms
    onRefresh?: () => void;
}

function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function getUtilizationColor(utilization: number): string {
    if (utilization >= 90) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (utilization >= 70) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
}

function getUtilizationIcon(utilization: number): LucideIcon {
    if (utilization >= 90) return AlertCircle;
    if (utilization >= 70) return TrendingUp;
    return CheckCircle;
}

export function PoolMetricsWidget({ 
    metrics, 
    compact = false, 
    showDetails = true,
    refreshInterval = 5000,
    onRefresh 
}: PoolMetricsWidgetProps) {
    if (!metrics) {
        return (
            <Card className="border-slate-800 bg-slate-900/50">
                <CardContent className="py-6 text-center">
                    <Database className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No pool metrics available</p>
                    {onRefresh && (
                        <button onClick={onRefresh} className="mt-2 text-xs text-cyan-400 hover:text-cyan-300">
                            Refresh
                        </button>
                    )}
                </CardContent>
            </Card>
        );
    }

    const utilization = metrics.maxConnections > 0 
        ? (metrics.activeConnections / metrics.maxConnections) * 100 
        : 0;
    
    const poolUtilization = metrics.poolSize > 0
        ? (metrics.activeConnections / metrics.poolSize) * 100
        : 0;

    const utilizationColor = getUtilizationColor(utilization);
    const UtilizationIcon = getUtilizationIcon(utilization);

    const statCards = [
        {
            label: 'Active',
            value: formatNumber(metrics.activeConnections),
            icon: Activity,
            color: 'text-cyan-400',
            trend: metrics.activeConnections > metrics.poolSize * 0.8 ? 'up' : 'stable'
        },
        {
            label: 'Idle',
            value: formatNumber(metrics.idleConnections),
            icon: Minus,
            color: 'text-slate-400',
            trend: 'stable'
        },
        {
            label: 'Waiting',
            value: formatNumber(metrics.waitingConnections),
            icon: AlertCircle,
            color: metrics.waitingConnections > 0 ? 'text-rose-400' : 'text-emerald-400',
            trend: metrics.waitingConnections > 0 ? 'up' : 'stable'
        },
        {
            label: 'Utilization',
            value: `${utilization.toFixed(1)}%`,
            icon: UtilizationIcon,
            color: utilizationColor.replace('text-rose-400', 'text-rose-400').replace('text-amber-400', 'text-amber-400').replace('text-emerald-400', 'text-emerald-400'),
            trend: utilization > 80 ? 'up' : 'stable'
        }
    ];

    return (
        <Card className="border-slate-800 bg-slate-900/50">
            {!compact && (
                <CardContent className="px-4 py-3 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-sm font-medium text-white">Connection Pool (PgBouncer)</h4>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[9px]', utilizationColor)}>
                            <UtilizationIcon className="w-3 h-3" />
                            {utilization.toFixed(1)}% utilized
                        </Badge>
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                className="p-1 text-slate-500 hover:text-white transition-colors"
                                title="Refresh metrics"
                            >
                                <Activity className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </CardContent>
            )}

            <CardContent className={cn('space-y-4', compact ? 'p-3' : 'p-4')}>
                {/* Main Stats Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {statCards.map((stat, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                    {stat.label}
                                </span>
                                <stat.icon className={cn('w-4 h-4', stat.color)} />
                            </div>
                            <div className="text-xl font-bold text-white">{stat.value}</div>
                            <div className={cn('text-[9px] mt-1 flex items-center gap-1',
                                stat.trend === 'up' ? 'text-rose-400' : 'text-emerald-400'
                            )}>
                                {stat.trend === 'up' && <TrendingUp className="w-2.5 h-2.5" />}
                                {stat.trend === 'down' && <TrendingDown className="w-2.5 h-2.5" />}
                                {stat.trend === 'stable' && <Minus className="w-2.5 h-2.5" />}
                                {stat.trend === 'up' ? 'High' : stat.trend === 'down' ? 'Low' : 'Normal'}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Utilization Bar */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Pool Utilization</span>
                        <span className="font-mono text-white">{poolUtilization.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full transition-all duration-500',
                                utilization >= 90 ? 'bg-rose-500' : utilization >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.min(poolUtilization, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                    </div>
                </div>

                {showDetails && (
                    <div className="pt-2 border-t border-slate-800 space-y-3">
                        {/* Configuration */}
                        <div className="grid grid-cols-2 gap-3 text-[10px]">
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Max Connections</div>
                                <div className="font-mono text-white">{formatNumber(metrics.maxConnections)}</div>
                            </div>
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Pool Size (default)</div>
                                <div className="font-mono text-white">{formatNumber(metrics.poolSize)}</div>
                            </div>
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Min Pool Size</div>
                                <div className="font-mono text-white">{formatNumber(metrics.minPoolSize)}</div>
                            </div>
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Reserve Pool</div>
                                <div className="font-mono text-white">{formatNumber(metrics.reservePoolSize)}</div>
                            </div>
                        </div>

                        {/* Performance */}
                        <div className="grid grid-cols-3 gap-3 text-[10px]">
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Avg Query Time</div>
                                <div className="font-mono text-white">{metrics.avgQueryTime.toFixed(2)}ms</div>
                            </div>
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Queries/sec</div>
                                <div className="font-mono text-white">{formatNumber(metrics.queriesPerSecond)}</div>
                            </div>
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Cache Hit Ratio</div>
                                <div className="font-mono text-white">{(metrics.cacheHitRatio * 100).toFixed(1)}%</div>
                            </div>
                        </div>

                        {/* Server Config */}
                        <div className="grid grid-cols-2 gap-3 text-[10px]">
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Server Lifetime</div>
                                <div className="font-mono text-white">{metrics.serverLifetime}s</div>
                            </div>
                            <div className="p-2 rounded bg-slate-800/50">
                                <div className="text-slate-400">Server Idle Timeout</div>
                                <div className="font-mono text-white">{metrics.serverIdleTimeout}s</div>
                            </div>
                        </div>

                        {/* Last Updated */}
                        <div className="flex items-center justify-between text-[9px] text-slate-500 pt-2 border-t border-slate-800">
                            <span>Last updated: {metrics.lastUpdated.toLocaleTimeString()}</span>
                            <span className="flex items-center gap-1">
                                <Activity className="w-3 h-3 animate-pulse text-emerald-400" />
                                Auto-refresh: {(refreshInterval / 1000).toFixed(0)}s
                            </span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// Helper to create mock metrics for testing
export function createMockPoolMetrics(overrides: Partial<PoolMetrics> = {}): PoolMetrics {
    return {
        totalConnections: 45,
        activeConnections: 23,
        idleConnections: 22,
        waitingConnections: 0,
        maxConnections: 1000,
        poolSize: 25,
        minPoolSize: 5,
        reservePoolSize: 5,
        avgQueryTime: 2.34,
        queriesPerSecond: 1250,
        cacheHitRatio: 0.94,
        serverLifetime: 3600,
        serverIdleTimeout: 600,
        lastUpdated: new Date(),
        ...overrides
    };
}
