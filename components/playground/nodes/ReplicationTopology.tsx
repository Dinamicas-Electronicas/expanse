"use client"

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Database, GitBranch, ArrowRight, CheckCircle, Circle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { HANodeBadge, HARoleBadge } from "./HANodeBadge";

export interface ReplicaNode {
    id: string;
    name: string;
    role: 'primary' | 'replica' | 'witness';
    replicationMode: 'sync' | 'async' | 'semi-sync';
    region: string;
    priority: number;
    status: 'healthy' | 'degraded' | 'failover' | 'critical' | 'maintenance' | 'unknown';
    lagMs?: number;
    lastHeartbeat?: Date;
}

interface ReplicationTopologyProps {
    primary?: ReplicaNode;
    replicas: ReplicaNode[];
    compact?: boolean;
    onNodeClick?: (node: ReplicaNode) => void;
    showLag?: boolean;
    showPriority?: boolean;
}

const roleIcons = {
    primary: Database,
    replica: Database,
    witness: HelpCircle
};

const roleColors = {
    primary: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    replica: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    witness: 'text-violet-400 border-violet-500/30 bg-violet-500/10'
};

const modeLabels = {
    sync: 'SYNC',
    async: 'ASYNC',
    'semi-sync': 'SEMI-SYNC'
};

const modeColors = {
    sync: 'text-emerald-400',
    async: 'text-amber-400',
    'semi-sync': 'text-orange-400'
};

function formatLag(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

export function ReplicationTopology({
    primary,
    replicas,
    compact = false,
    onNodeClick,
    showLag = true,
    showPriority = true
}: ReplicationTopologyProps) {
    const [expanded, setExpanded] = useState(!compact);

    if (!primary && replicas.length === 0) {
        return (
            <Card className="border-slate-800 bg-slate-900/50">
                <CardContent className="py-6 text-center">
                    <GitBranch className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No replication topology configured</p>
                </CardContent>
            </Card>
        );
    }

    const syncReplicas = replicas.filter(r => r.replicationMode === 'sync');
    const asyncReplicas = replicas.filter(r => r.replicationMode === 'async');
    const witnessReplicas = replicas.filter(r => r.role === 'witness');

    return (
        <Card className="border-slate-800 bg-slate-900/50 overflow-hidden">
            <CardContent className="p-0">
                {!compact && (
                    <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/30">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                <GitBranch className="w-4 h-4 text-emerald-400" />
                                Replication Topology
                            </h4>
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                            >
                                {expanded ? 'Collapse' : 'Expand'}
                            </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {syncReplicas.length} Sync
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                {asyncReplicas.length} Async
                            </span>
                            {witnessReplicas.length > 0 && (
                                <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                    {witnessReplicas.length} Witness
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {expanded && (
                    <div className="p-4 space-y-4">
                        {/* Primary Node */}
                        {primary && (
                            <div className="relative">
                                <div className="flex items-center gap-3 p-3 rounded-lg border bg-slate-900/50"
                                    style={{ borderColor: roleColors.primary.replace('text-emerald-400 border-emerald-500/30 bg-emerald-500/10', '').trim() }}
                                >
                                    <div className="relative">
                                        <div className={cn(
                                            'w-12 h-12 rounded-xl flex items-center justify-center border-2 shadow-lg',
                                            roleColors.primary
                                        )}>
                                            <Database className="w-6 h-6" />
                                        </div>
                                        <HANodeBadge status={primary.status} size="sm" showLabel={false} className="absolute -top-1 -right-1" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h5 className="font-medium text-white truncate">{primary.name}</h5>
                                            <HARoleBadge role="primary" />
                                            <span className={cn(
                                                'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border',
                                                modeColors[primary.replicationMode],
                                                `bg-${primary.replicationMode === 'sync' ? 'emerald' : primary.replicationMode === 'async' ? 'amber' : 'orange'}-500/10`,
                                                `border-${primary.replicationMode === 'sync' ? 'emerald' : primary.replicationMode === 'async' ? 'amber' : 'orange'}-500/30`
                                            )}>
                                                {modeLabels[primary.replicationMode]}
                                            </span>
                                            {primary.region && (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium text-slate-400 bg-slate-800 border border-slate-700">
                                                    {primary.region}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
                                            {showPriority && (
                                                <span className="flex items-center gap-1">
                                                    <GitBranch className="w-3 h-3" />
                                                    Priority: {primary.priority}
                                                </span>
                                            )}
                                            {showLag && primary.lagMs !== undefined && (
                                                <span className={cn(
                                                    'flex items-center gap-1',
                                                    primary.lagMs > 1000 ? 'text-amber-400' : 'text-emerald-400'
                                                )}>
                                                    <GitBranch className="w-3 h-3" />
                                                    Lag: {formatLag(primary.lagMs)}
                                                </span>
                                            )}
                                            {primary.lastHeartbeat && (
                                                <span className="flex items-center gap-1">
                                                    <Circle className="w-3 h-3" />
                                                    Last seen: {primary.lastHeartbeat.toLocaleTimeString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {onNodeClick && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onNodeClick(primary); }}
                                            className="p-1 text-slate-500 hover:text-white transition-colors"
                                            title="Configure"
                                        >
                                            <GitBranch className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Replicas */}
                        {replicas.length > 0 && (
                            <div className="space-y-2 pl-3 border-l border-slate-800">
                                {replicas.map((replica) => (
                                    <div key={replica.id} className="relative">
                                        <div className="absolute left-[-19px] top-1/2 -translate-y-1/2 flex items-center">
                                            <div className="w-2 h-2 rounded-full bg-slate-700 border border-slate-800 z-10" />
                                            <div className="w-px h-full bg-slate-700 absolute left-1 top-full" />
                                        </div>
                                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-slate-900/30"
                                            style={{ borderColor: roleColors[replica.role].replace('text-emerald-400 border-emerald-500/30 bg-emerald-500/10', '').trim() }}
                                            onClick={() => onNodeClick?.(replica)}
                                        >
                                            <div className="relative">
                                                <div className={cn(
                                                    'w-10 h-10 rounded-lg flex items-center justify-center border-2',
                                                    roleColors[replica.role]
                                                )}>
                                                    {(roleIcons[replica.role] as React.ComponentType<{ className?: string }>) && React.createElement(roleIcons[replica.role], { className: "w-5 h-5" })}
                                                </div>
                                                <HANodeBadge status={replica.status} size="sm" showLabel={false} className="absolute -top-1 -right-1" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h5 className="font-medium text-white truncate">{replica.name}</h5>
                                                    <HARoleBadge role={replica.role} />
                                                    <span className={cn(
                                                        'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border',
                                                        modeColors[replica.replicationMode],
                                                        `bg-${replica.replicationMode === 'sync' ? 'emerald' : replica.replicationMode === 'async' ? 'amber' : 'orange'}-500/10`,
                                                        `border-${replica.replicationMode === 'sync' ? 'emerald' : replica.replicationMode === 'async' ? 'amber' : 'orange'}-500/30`
                                                    )}>
                                                        {modeLabels[replica.replicationMode]}
                                                    </span>
                                                    {replica.region && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium text-slate-400 bg-slate-800 border border-slate-700">
                                                            {replica.region}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
                                                    {showPriority && (
                                                        <span className="flex items-center gap-1">
                                                            <GitBranch className="w-3 h-3" />
                                                            Priority: {replica.priority}
                                                        </span>
                                                    )}
                                                    {showLag && replica.lagMs !== undefined && (
                                                        <span className={cn(
                                                            'flex items-center gap-1',
                                                            replica.lagMs > 1000 ? 'text-amber-400' : 'text-emerald-400'
                                                        )}>
                                                            <GitBranch className="w-3 h-3" />
                                                            Lag: {formatLag(replica.lagMs)}
                                                        </span>
                                                    )}
                                                    {replica.lastHeartbeat && (
                                                        <span className="flex items-center gap-1">
                                                            <Circle className="w-3 h-3" />
                                                            {replica.lastHeartbeat.toLocaleTimeString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-slate-600" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Legend */}
                        <div className="pt-2 border-t border-slate-800">
                            <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
                                <div className="flex items-center gap-1">
                                    <Database className="w-3 h-3 text-emerald-400" />
                                    <span>Primary (Read/Write)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Database className="w-3 h-3 text-cyan-400" />
                                    <span>Replica (Read Only)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <HelpCircle className="w-3 h-3 text-violet-400" />
                                    <span>Witness (Quorum Only)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                    <span>Sync Replication</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <GitBranch className="w-3 h-3 text-amber-400" />
                                    <span>Async Replication</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// Helper to create topology from HA config
export function createTopologyFromHAConfig(haConfig: any): { primary: ReplicaNode | undefined; replicas: ReplicaNode[] } {
    if (!haConfig?.replication?.enabled) {
        return { primary: undefined, replicas: [] };
    }

    const primary: ReplicaNode = {
        id: 'primary',
        name: 'db-primary',
        role: 'primary',
        replicationMode: haConfig.replication.mode || 'async',
        region: haConfig.replication.primaryRegion || 'primary',
        priority: 100,
        status: 'healthy'
    };

    const replicas: ReplicaNode[] = (haConfig.replication.replicas || []).map((r: any, idx: number) => ({
        id: `replica-${idx}`,
        name: r.region || `replica-${idx + 1}`,
        role: r.role === 'witness' ? 'witness' : 'replica',
        replicationMode: haConfig.replication.mode || 'async',
        region: r.region || `region-${idx + 1}`,
        priority: r.priority || 50,
        status: 'healthy'
    }));

    return { primary, replicas };
}
