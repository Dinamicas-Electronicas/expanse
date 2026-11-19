"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import React from "react";
import { useExecutionStore } from "@/store/execution";
import { cn } from "@/lib/utils";
import { Terminal, CheckCircle2, Loader2, PlayCircle, StopCircle, Command } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ExecutionPanelErrorBoundary } from "@/components/ui/errorBoundary";
import { HaMetricsPanel } from "@/components/playground/haMetricsPanel";
import { ServiceViewer } from "@/components/playground/viewer";
const TerminalDialog = dynamic(() => import("./terminalDialog"), { ssr: false });

interface ExecutionPanelProps {
    haConfig?: {
        enabled: boolean;
        minReplicas?: number;
        maxReplicas?: number;
    };
}

export default function ExecutionPanel({ haConfig }: ExecutionPanelProps) {
    const { isExecuting, serviceStatuses, logs } = useExecutionStore();
    const [terminalOpen, setTerminalOpen] = React.useState(false);
    const [activeContainer, setActiveContainer] = React.useState<{ id: string; name: string } | null>(null);
    const t = useTranslations('execution');

    const services = Object.values(serviceStatuses);

    // Extract viewer services from running services with web ports
    const viewerServices = React.useMemo(() => {
        const viewers = [];
        for (const service of Object.values(serviceStatuses)) {
            if (!service.ports || service.status !== 'running') continue;
            
            // Extract host port from ports string like "0.0.0.0:8080->80/tcp, :::8080->80/tcp"
            const portMatch = service.ports.match(/0\.0\.0\.0:(\d+)->(\d+)\/tcp/);
            if (!portMatch) continue;
            
            const hostPort = parseInt(portMatch[1]);
            const containerPort = parseInt(portMatch[2]);
            
            // Check if this is a known web service (common web ports)
            const webPorts = [80, 443, 3000, 4000, 5000, 8000, 8080, 8081, 8443, 9000, 2368, 4000];
            if (!webPorts.includes(containerPort)) continue;

            viewers.push({
                serviceId: service.id,
                serviceName: service.name,
                displayName: service.name,
                icon: 'globe',
                url: `http://localhost:${hostPort}`,
                internalUrl: `http://${service.name}:${containerPort}`,
                healthCheckUrl: `http://localhost:${hostPort}`,
                status: 'healthy' as const,
                lastChecked: new Date(),
                startupTimeEstimate: 30
            });
        }
        return viewers;
    }, [serviceStatuses]);

    if (!isExecuting && Object.keys(serviceStatuses).length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <PlayCircle className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm font-medium">{t('noServicesRunning')}</p>
            </div>
        );
    }

    const openTerminal = (id: string, name: string) => {
        setActiveContainer({ id, name });
        setTerminalOpen(true);
    };

    return (
        <ExecutionPanelErrorBoundary>
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Services Status */}
            <div className="grid grid-cols-1 gap-2">
                {services.map((service) => (
                    <div
                        key={service.id}
                        className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm group/svc"
                    >
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "p-2 rounded-lg transition-colors",
                                service.status === 'running' ? "bg-emerald-50 text-emerald-600" :
                                    service.status === 'exited' ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600"
                            )}>
                                {service.status === 'running' ? <CheckCircle2 className="w-4 h-4" /> :
                                    service.status === 'exited' ? <StopCircle className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-900 truncate max-w-[120px]">{service.name}</span>
                                <span className="text-[10px] text-slate-500 uppercase font-black">{service.status}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {service.status === 'running' && (
                                <button
                                    onClick={() => openTerminal(service.id, service.name)}
                                    aria-label={t('openTerminal')}
                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-all opacity-0 group-hover/svc:opacity-100"
                                    title={t('openTerminal')}
                                >
                                    <Command className="w-4 h-4" />
                                </button>
                            )}
                            {service.health && (
                                <div className={cn(
                                    "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                                    service.health === 'healthy' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                )}>
                                    {service.health}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <TerminalDialog
                open={terminalOpen}
                onOpenChange={setTerminalOpen}
                containerId={activeContainer?.id || ""}
                containerName={activeContainer?.name || ""}
            />

            {/* Terminal Logs */}
            <div className="flex flex-col bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-3 h-3 text-slate-400" />
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{t('containerLogs')}</span>
                    </div>
                    <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-rose-500/20" />
                        <div className="w-2 h-2 rounded-full bg-amber-500/20" />
                        <div className="w-2 h-2 rounded-full bg-emerald-500/20" />
</div>
            </div>

            {haConfig?.enabled && <HaMetricsPanel minReplicas={haConfig.minReplicas} maxReplicas={haConfig.maxReplicas} />}

            {viewerServices.length > 0 && (
                <ServiceViewer
                    services={viewerServices}
                    onOpenLogs={(serviceName) => {
                        const svc = services.find(s => s.name === serviceName);
                        if (svc) openTerminal(svc.id, svc.name);
                    }}
                />
            )}

            <div className="p-4 h-[200px] overflow-y-auto font-mono text-[10px] text-slate-300 custom-scrollbar whitespace-pre-wrap leading-relaxed">
                    {logs ? logs : (
                        <div className="flex items-center justify-center h-full text-slate-500 italic">
                            {t('waitingForLogs')}
                        </div>
                    )}
                </div>
            </div>
        </div>
        </ExecutionPanelErrorBoundary>
    );
}