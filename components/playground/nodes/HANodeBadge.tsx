"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { Shield, AlertTriangle, XCircle, CheckCircle2, Database, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type HAStatus = 'healthy' | 'degraded' | 'failover' | 'critical' | 'maintenance' | 'unknown';

interface HANodeBadgeProps {
    status: HAStatus;
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
    className?: string;
}

const statusConfig: Record<HAStatus, { icon: React.ReactNode; label: string; color: string; bg: string; border: string; animate?: boolean }> = {
    healthy: {
        icon: <CheckCircle2 className="w-3 h-3" />,
        label: 'Healthy',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30'
    },
    degraded: {
        icon: <AlertTriangle className="w-3 h-3" />,
        label: 'Degraded',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30'
    },
    failover: {
        icon: <RefreshCw className="w-3 h-3 animate-spin" />,
        label: 'Failover',
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        animate: true
    },
    critical: {
        icon: <XCircle className="w-3 h-3" />,
        label: 'Critical',
        color: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30'
    },
    maintenance: {
        icon: <Database className="w-3 h-3" />,
        label: 'Maintenance',
        color: 'text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/30'
    },
    unknown: {
        icon: <Shield className="w-3 h-3" />,
        label: 'Unknown',
        color: 'text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/30'
    }
};

const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[9px] gap-1',
    md: 'px-2 py-1 text-[10px] gap-1.5',
    lg: 'px-3 py-1.5 text-xs gap-2'
};

export function HANodeBadge({ status = 'unknown', size = 'md', showLabel = true, className }: HANodeBadgeProps) {
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
        <span className={cn(
            'inline-flex items-center font-medium uppercase tracking-wider rounded-full border',
            'backdrop-blur-sm shadow-sm',
            sizeClasses[size],
            config.color,
            config.bg,
            config.border,
            className
        )}>
            <span className="flex-shrink-0" style={{ animation: config.animate ? 'pulse 2s infinite' : 'none' }}>
                {Icon}
            </span>
            {showLabel && <span>{config.label}</span>}
        </span>
    );
}

export function HAStatusIndicator({ status = 'unknown', className }: { status: HAStatus; className?: string }) {
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
        <span className={cn(
            'inline-flex items-center justify-center rounded-full border-2',
            'w-5 h-5 sm:w-6 sm:h-6',
            config.color,
            config.border,
            className
        )} title={config.label}>
            {Icon}
        </span>
    );
}

export function HARoleBadge({ role }: { role: 'primary' | 'replica' | 'witness' | 'sync' | 'async' }) {
    const configs = {
        primary: { label: 'PRIMARY', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <Database className="w-3 h-3" /> },
        replica: { label: 'REPLICA', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', icon: <Database className="w-3 h-3" /> },
        witness: { label: 'WITNESS', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', icon: <Shield className="w-3 h-3" /> },
        sync: { label: 'SYNC', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
        async: { label: 'ASYNC', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: <RefreshCw className="w-3 h-3" /> }
    };

    const config = configs[role];

    return (
        <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full border',
            'backdrop-blur-sm',
            config.color,
            config.bg,
            config.border
        )}>
            {config.icon}
            {config.label}
        </span>
    );
}