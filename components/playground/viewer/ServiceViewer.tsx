"use client"

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Copy, Loader2, CheckCircle, AlertCircle, Wifi, WifiOff, Globe, RefreshCw, TerminalSquare, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ViewerService {
    serviceId: string;
    serviceName: string;
    displayName: string;
    icon: string;
    url: string;                    // URL final (host:port/path)
    internalUrl: string;            // URL interna (servicio:puerto/path)
    healthCheckUrl: string;
    status: 'pending' | 'healthy' | 'unhealthy' | 'unknown';
    lastChecked: Date | null;
    startupTimeEstimate?: number;   // seconds
}

interface ServiceViewerProps {
    services: ViewerService[];
    onServiceClick?: (service: ViewerService) => void;
    onOpenLogs?: (serviceName: string) => void;
    compact?: boolean;
    autoRefresh?: boolean;
    refreshInterval?: number; // ms
}

const statusConfig = {
    pending: { icon: Loader2, label: 'Starting...', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', animate: true },
    healthy: { icon: CheckCircle, label: 'Available', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'bg-emerald-500/20', animate: false },
    unhealthy: { icon: AlertCircle, label: 'Unavailable', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'bg-rose-500/20', animate: false },
    unknown: { icon: WifiOff, label: 'Unknown', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'bg-slate-500/20', animate: false }
};

function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
}

export function ServiceViewer({ 
    services, 
    onOpenLogs,
    compact = false,
    autoRefresh = true,
    refreshInterval = 5000
}: ServiceViewerProps) {
    const [healthStatuses, setHealthStatuses] = useState<Map<string, ViewerService['status']>>(new Map());
    const [checkCounts, setCheckCounts] = useState<Map<string, number>>(new Map());

    // Health check function
    const checkHealth = useCallback(async (service: ViewerService) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        try {
            const response = await fetch(service.healthCheckUrl, { 
                method: 'HEAD',
                signal: controller.signal,
                mode: 'no-cors' // Allow cross-origin for health checks
            });
            clearTimeout(timeout);
            return response.ok || response.type === 'opaque'; // opaque means no-cors succeeded
        } catch {
            clearTimeout(timeout);
            // For no-cors, we can't read response, so assume success if no network error
            // In production, you'd want a proper health endpoint with CORS
            return false;
        }
    }, []);

    // Poll health for pending services
    useEffect(() => {
        if (!autoRefresh) return;
        
        const pendingServices = services.filter(s => s.status === 'pending');
        if (pendingServices.length === 0) return;

        const interval = setInterval(async () => {
            for (const service of pendingServices) {
                const count = (checkCounts.get(service.serviceId) || 0) + 1;
                setCheckCounts(prev => new Map(prev).set(service.serviceId, count));
                
                const maxAttempts = Math.ceil((service.startupTimeEstimate || 60) * 1000 / refreshInterval);
                if (count >= maxAttempts) {
                    setHealthStatuses(prev => new Map(prev).set(service.serviceId, 'unhealthy'));
                } else {
                    const healthy = await checkHealth(service);
                    if (healthy) {
                        setHealthStatuses(prev => new Map(prev).set(service.serviceId, 'healthy'));
                    }
                }
            }
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [services, autoRefresh, refreshInterval, checkCounts, checkHealth]);

    // Get effective status (from health check or original)
    const getEffectiveStatus = (service: ViewerService) => {
        return healthStatuses.get(service.serviceId) || service.status;
    };

    if (services.length === 0) {
        return (
            <Card className="border-slate-800 bg-slate-900/50">
                <CardContent className="py-6 text-center">
                    <Globe className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No web services in this stack</p>
                    <p className="text-[10px] text-slate-600 mt-1">Add services with webFrontend config to enable viewer</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
            {!compact && (
                <CardContent className="px-4 py-3 border-b border-emerald-500/10 bg-slate-900/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-sm font-medium text-white">Service Viewer</h4>
                            <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">
                                {services.length} web service{services.length !== 1 ? 's' : ''}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Wifi className="w-3 h-3" />
                            Auto-refresh: {(refreshInterval / 1000).toFixed(0)}s
                        </div>
                    </div>
                </CardContent>
            )}

            <CardContent className="p-0">
                <div className="divide-y divide-emerald-500/10">
                    {services.map((service) => {
                        const effectiveStatus = getEffectiveStatus(service);
                        const config = statusConfig[effectiveStatus];
                        const Icon = config.icon;
                        const checkCount = checkCounts.get(service.serviceId) || 0;
                        const maxAttempts = Math.ceil((service.startupTimeEstimate || 60) * 1000 / refreshInterval);
                        const progress = service.startupTimeEstimate ? Math.min((checkCount / maxAttempts) * 100, 100) : 0;

                        return (
                            <div key={service.serviceId} className="p-4 hover:bg-slate-800/30 transition-colors">
                                <div className="flex items-start gap-3">
                                    {/* Status indicator */}
                                    <div className={cn(
                                        'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                                        config.bg,
                                        config.border
                                    )}>
                                        <Icon className={cn('w-5 h-5', config.color, config.animate && 'animate-spin')} />
                                    </div>

                                    {/* Service info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h5 className="font-medium text-white truncate">{service.displayName}</h5>
                                            <Badge variant="outline" className={cn('text-[9px]', config.color.replace('text-', ''), config.border)}>
                                             {config.icon === Loader2 ? <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" /> : <Icon className="w-2.5 h-2.5 mr-1" />}
                                                {config.label}
                                            </Badge>
                                            {service.status === 'pending' && (
                                                <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30">
                                                    Attempt {checkCount}/{maxAttempts}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
                                            <span className="flex items-center gap-1 font-mono truncate max-w-[200px]" title={service.url}>
                                                <ExternalLink className="w-3 h-3" />
                                                {service.url}
                                            </span>
                                            {service.internalUrl !== service.url && (
                                                <span className="flex items-center gap-1 text-slate-600" title={service.internalUrl}>
                                                    <Database className="w-3 h-3" />
                                                    Internal: {service.internalUrl}
                                                </span>
                                            )}
                                        </div>

                                        {/* Progress bar for pending */}
                                        {service.status === 'pending' && service.startupTimeEstimate && (
                                            <div className="mt-2 space-y-1">
                                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            'h-full rounded-full transition-all duration-300',
                                                            config.color.replace('text-', 'bg-')
                                                        )}
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between text-[9px] text-slate-500">
                                                    <span>Estimated: {formatTime(service.startupTimeEstimate)}</span>
                                                    <span>Elapsed: {formatTime(checkCount * (refreshInterval / 1000))}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Error details for unhealthy */}
                                        {effectiveStatus === 'unhealthy' && service.lastChecked && (
                                            <div className="mt-2 p-2 rounded bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300">
                                                <div className="flex items-center gap-1 mb-1">
                                                    <AlertCircle className="w-3 h-3" />
                                                    <span>Health check failed after {maxAttempts} attempts</span>
                                                </div>
                                                <div className="font-mono text-rose-400">{service.healthCheckUrl}</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col gap-1.5">
                                        {effectiveStatus === 'healthy' && (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="w-full sm:w-auto"
                                                onClick={() => window.open(service.url, '_blank', 'noopener,noreferrer')}
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                                Open
                                            </Button>
                                        )}

                                        {effectiveStatus === 'unhealthy' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full sm:w-auto border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                                onClick={() => {
                                                    setHealthStatuses(prev => new Map(prev).set(service.serviceId, 'pending'));
                                                    setCheckCounts(prev => new Map(prev).set(service.serviceId, 0));
                                                }}
                                            >
                                                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                                Retry
                                            </Button>
                                        )}

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full sm:w-auto justify-center"
                                            onClick={() => {
                                                navigator.clipboard.writeText(service.url);
                                            }}
                                            title="Copy URL"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>

                                        {onOpenLogs && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full sm:w-auto justify-center text-slate-400 hover:text-white"
                                                onClick={() => onOpenLogs(service.serviceName)}
                                                title="View logs"
                                            >
                                                <TerminalSquare className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer actions */}
                <div className="p-3 border-t border-emerald-500/10 bg-slate-900/30 flex flex-wrap gap-2">
                    {services.some(s => getEffectiveStatus(s) === 'healthy') && (
                        <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            Open All Healthy
                        </Button>
                    )}
                    {services.some(s => getEffectiveStatus(s) === 'pending') && (
                        <Button variant="ghost" size="sm" className="flex-1 sm:flex-none text-amber-400 hover:text-amber-300">
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            Retry Pending
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// Helper to extract viewer services from deployed compose
export function extractViewerServicesFromCompose(): ViewerService[] {
    const viewers: ViewerService[] = [];

    // This would need access to template library to get webFrontend config
    // For now, return empty - actual implementation would be in lib/viewer.ts
    return viewers;
}
