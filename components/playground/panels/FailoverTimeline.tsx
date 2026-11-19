"use client"

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle, Clock, RotateCcw, Database, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FailoverEvent {
    id: string;
    timestamp: Date;
    type: 'automatic' | 'manual' | 'promotion' | 'demotion' | 'split-brain';
    fromNode: string;
    toNode: string;
    reason: string;
    duration: number; // milliseconds
    success: boolean;
    details?: string;
}

interface FailoverTimelineProps {
    events: FailoverEvent[];
    maxEvents?: number;
    onEventClick?: (event: FailoverEvent) => void;
    compact?: boolean;
}

const typeIcons = {
    automatic: RotateCcw,
    manual: Database,
    promotion: CheckCircle,
    demotion: XCircle,
    'split-brain': Zap
};

const typeLabels = {
    automatic: 'Auto Failover',
    manual: 'Manual Failover',
    promotion: 'Promotion',
    demotion: 'Demotion',
    'split-brain': 'Split-Brain'
};

const typeColors = {
    automatic: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    manual: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    promotion: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    demotion: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'split-brain': 'text-rose-400 bg-rose-500/10 border-rose-500/20'
};

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function FailoverTimeline({ events = [], maxEvents = 20, onEventClick, compact = false }: FailoverTimelineProps) {
    const sortedEvents = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const displayEvents = sortedEvents.slice(0, maxEvents);

    if (displayEvents.length === 0) {
        return (
            <Card className="border-slate-800 bg-slate-900/50">
                <CardContent className="py-6 text-center">
                    <RotateCcw className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No failover events recorded</p>
                </CardContent>
            </Card>
        );
    }

    const successfulEvents = events.filter(e => e.success).length;
    const failedEvents = events.filter(e => !e.success).length;
    const avgDuration = events.length > 0
        ? events.reduce((sum, e) => sum + e.duration, 0) / events.length
        : 0;

    return (
        <Card className="border-slate-800 bg-slate-900/50">
            {!compact && (
                <CardContent className="px-4 py-3 border-b border-slate-800 bg-slate-900/30">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-white flex items-center gap-2">
                            <RotateCcw className="w-4 h-4 text-orange-400" />
                            Failover Timeline
                        </h4>
                        <div className="flex items-center gap-4 text-[10px]">
                            <span className="flex items-center gap-1 text-emerald-400">
                                <CheckCircle className="w-3 h-3" />
                                {successfulEvents}
                            </span>
                            <span className="flex items-center gap-1 text-rose-400">
                                <XCircle className="w-3 h-3" />
                                {failedEvents}
                            </span>
                            <span className="flex items-center gap-1 text-slate-400">
                                <Clock className="w-3 h-3" />
                                Avg: {formatDuration(avgDuration)}
                            </span>
                        </div>
                    </div>
                </CardContent>
            )}

            <CardContent className="p-0">
                <div className="divide-y divide-slate-800">
                    {displayEvents.map((event, index) => (
                        <div
                            key={event.id}
                            className={cn(
                                'relative px-4 py-3 hover:bg-slate-800/30 transition-colors',
                                onEventClick && 'cursor-pointer',
                                index === displayEvents.length - 1 && 'pb-4'
                            )}
                            onClick={() => onEventClick?.(event)}
                        >
                            {/* Timeline line */}
                            <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-700" />
                            
                            <div className="relative flex items-start gap-3">
                                {/* Timeline dot */}
                                <div className={cn(
                                    'relative z-10 flex-shrink-0 w-3 h-3 rounded-full border-2 border-slate-900',
                                    event.success ? 'bg-emerald-400' : 'bg-rose-400'
                                )} />
                                
                                {/* Event content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge
                                            variant="outline"
                                            className={cn('text-[9px] px-2 py-0.5', typeColors[event.type])}
                                        >
                                            {React.createElement(typeIcons[event.type], { className: "w-2.5 h-2.5 mr-1" })}
                                            {typeLabels[event.type]}
                                        </Badge>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                            {formatTime(event.timestamp)}
                                        </span>
                                        <Badge
                                            variant={event.success ? "success" : "destructive"}
                                            className="text-[9px]"
                                        >
                                            {event.success ? 'Success' : 'Failed'}
                                        </Badge>
                                    </div>
                                    
                                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
                                        <span className="flex items-center gap-1">
                                            <Database className="w-3 h-3" />
                                            {event.fromNode} → {event.toNode}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDuration(event.duration)}
                                        </span>
                                        {event.reason && (
                                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                                                <AlertTriangle className="w-3 h-3" />
                                                {event.reason}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {event.details && (
                                        <div className="mt-2 p-2 rounded bg-slate-800/50 border border-slate-700 text-[10px] text-slate-400 font-mono">
                                            {event.details}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                
                {events.length > maxEvents && (
                    <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/30 text-center">
                        <span className="text-xs text-slate-500">
                            Showing {maxEvents} of {events.length} events
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// Mock data generator for testing
export function generateMockFailoverEvents(): FailoverEvent[] {
    const now = new Date();
    return [
        {
            id: '1',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 2),
            type: 'automatic',
            fromNode: 'db-primary',
            toNode: 'db-replica-1',
            reason: 'Primary unreachable (network partition)',
            duration: 12500,
            success: true,
            details: 'Patroni initiated failover after 10s timeout. Replica promoted successfully.'
        },
        {
            id: '2',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24),
            type: 'manual',
            fromNode: 'db-replica-1',
            toNode: 'db-primary',
            reason: 'Scheduled maintenance',
            duration: 8200,
            success: true,
            details: 'Manual switchover for primary OS patching. No data loss.'
        },
        {
            id: '3',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 48),
            type: 'automatic',
            fromNode: 'db-primary',
            toNode: 'db-replica-2',
            reason: 'Primary OOM kill',
            duration: 15800,
            success: true,
            details: 'Primary killed by OOM. Async replica promoted with 2.3MB lag.'
        },
        {
            id: '4',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 72),
            type: 'split-brain',
            fromNode: 'db-primary',
            toNode: 'db-replica-1',
            reason: 'Network partition - both nodes accepted writes',
            duration: 45000,
            success: false,
            details: 'Split-brain detected. Manual intervention required. Data divergence: 127 transactions.'
        }
    ];
}
