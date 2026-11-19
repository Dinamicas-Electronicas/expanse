"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import React, { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, ArrowUpDown, Save, AlertTriangle } from "lucide-react";
import { DatabaseHAConfig, ReplicationConfig, FailoverConfig, ConnectionPoolConfig, LoadBalancerConfigExtended, BackupConfig } from "@/types/library";

interface HAConfigPanelProps {
    config: DatabaseHAConfig;
    onChange: (config: DatabaseHAConfig) => void;
    readOnly?: boolean;
    onValidate?: (errors: string[]) => void;
}

const defaultReplication: ReplicationConfig = {
    enabled: true,
    mode: 'async',
    primaryRegion: 'primary',
    replicas: [
        { region: 'replica-1', role: 'sync', priority: 100 },
        { region: 'replica-2', role: 'async', priority: 50 }
    ]
};

const defaultFailover: FailoverConfig = {
    enabled: true,
    timeout: 30,
    maxRetries: 3,
    healthCheckInterval: 10,
    promotionPolicy: 'priority'
};

const defaultPool: ConnectionPoolConfig = {
    enabled: true,
    type: 'pgbouncer',
    mode: 'transaction',
    poolSize: 25,
    maxConnections: 1000,
    idleTimeout: 600
};

const defaultLB: LoadBalancerConfigExtended = {
    enabled: true,
    type: 'haproxy',
    algorithm: 'round-robin',
    healthCheckPath: '/health',
    stickySessions: false,
    port: 5432,
    targetPort: 5432
};

const defaultBackup: BackupConfig = {
    enabled: true,
    schedule: '0 2 * * *',
    retentionDays: 7,
    storage: 'local',
    encryption: true,
    pointInTimeRecovery: true
};

export function HAConfigPanel({ config, onChange, readOnly = false, onValidate }: HAConfigPanelProps) {
    const [activeTab, setActiveTab] = useState('replication');
    const [errors, setErrors] = useState<string[]>([]);

    const updateConfig = (partial: Partial<DatabaseHAConfig>) => {
        const newConfig = { ...config, ...partial };
        onChange(newConfig);
        validateConfig(newConfig);
    };

    const validateConfig = useCallback((cfg: DatabaseHAConfig) => {
        const errs: string[] = [];

        if (cfg.replication?.enabled) {
            const voters = (cfg.replication.replicas?.filter(r => r.role !== 'witness').length || 0) + 1;
            if (voters < 3) errs.push('Minimum 3 voting nodes required for quorum (primary + 2 replicas)');
            
            const syncReplicas = cfg.replication.replicas?.filter(r => r.role === 'sync').length || 0;
            if (cfg.replication.mode === 'sync' && syncReplicas === 0) {
                errs.push('Sync mode requires at least 1 sync replica');
            }
        }

        if (cfg.connectionPool?.enabled) {
            if ((cfg.connectionPool.maxConnections || 0) > 10000) {
                errs.push('maxConnections > 10000 may require kernel tuning');
            }
            if ((cfg.connectionPool.poolSize || 0) > (cfg.connectionPool.maxConnections || 1000)) {
                errs.push('poolSize cannot exceed maxConnections');
            }
        }

        if (cfg.loadBalancer?.enabled) {
            if (cfg.loadBalancer.port === cfg.loadBalancer.targetPort) {
                // This is fine for TCP load balancing
            }
        }

        if (cfg.backup?.enabled && cfg.backup.storage !== 'local') {
            errs.push('Remote storage (S3/GCS/Azure) requires additional configuration not yet implemented');
        }

        setErrors(errs);
        onValidate?.(errs);
    }, [onValidate]);

    React.useEffect(() => {
        validateConfig(config);
    }, [config, validateConfig]);

    const replicationConfig = config.replication || defaultReplication;
    const failoverConfig = config.failover || defaultFailover;
    const poolConfig = config.connectionPool || defaultPool;
    const lbConfig = config.loadBalancer || defaultLB;
    const backupConfig = config.backup || defaultBackup;

    return (
        <Card className="border-slate-800 bg-slate-900/50 w-full max-w-2xl">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    HA Configuration
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Validation Errors */}
                {errors.length > 0 && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-rose-400">
                            <AlertTriangle className="w-3 h-3" />
                            <span className="font-medium">Validation Warnings</span>
                        </div>
                        <ul className="ml-4 space-y-0.5 list-disc text-[11px] text-rose-300">
                            {errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                    </div>
                )}

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-5 bg-slate-800/50 p-1 rounded-lg">
                        <TabsTrigger value="replication" className="text-[10px] py-1.5">Replication</TabsTrigger>
                        <TabsTrigger value="failover" className="text-[10px] py-1.5">Failover</TabsTrigger>
                        <TabsTrigger value="pool" className="text-[10px] py-1.5">Pooling</TabsTrigger>
                        <TabsTrigger value="lb" className="text-[10px] py-1.5">Load Balancer</TabsTrigger>
                        <TabsTrigger value="backup" className="text-[10px] py-1.5">Backup</TabsTrigger>
                    </TabsList>

                    {/* REPLICATION TAB */}
                    <TabsContent value="replication" className="space-y-4 pt-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Enable Replication</Label>
                                <p className="text-xs text-slate-500">Multi-node PostgreSQL cluster with Patroni</p>
                            </div>
                            <Switch
                                checked={replicationConfig.enabled}
                                onCheckedChange={(v) => updateConfig({ replication: { ...replicationConfig, enabled: v } })}
                                disabled={readOnly}
                            />
                        </div>

                        {replicationConfig.enabled && (
                            <div className="space-y-4 border-t pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Replication Mode</Label>
                                        <Select
                                            value={replicationConfig.mode}
                                            onValueChange={(v) => updateConfig({ replication: { ...replicationConfig, mode: v as any } })}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="Select mode" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="async">Async (Best Performance)</SelectItem>
                                                <SelectItem value="semi-sync">Semi-Sync (Balanced)</SelectItem>
                                                <SelectItem value="sync">Sync (Strong Consistency)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] text-slate-500">
                                            {replicationConfig.mode === 'sync' && 'Strong consistency, higher latency'}
                                            {replicationConfig.mode === 'semi-sync' && 'Balanced consistency/performance'}
                                            {replicationConfig.mode === 'async' && 'Best performance, potential data loss'}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label>Primary Region</Label>
                                        <Input
                                            value={replicationConfig.primaryRegion}
                                            onChange={(e) => updateConfig({ replication: { ...replicationConfig, primaryRegion: e.target.value } })}
                                            placeholder="primary"
                                            disabled={readOnly}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                {/* Replicas List */}
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5">
                                        Replicas
                                        <Button variant="ghost" size="icon" className="h-6 w-6 p-0" onClick={() => {
                                            const newReplicas = [...(replicationConfig.replicas || []), { region: `replica-${(replicationConfig.replicas?.length || 0) + 1}`, role: 'async' as const, priority: 50 }];
                                            updateConfig({ replication: { ...replicationConfig, replicas: newReplicas } });
                                        }} disabled={readOnly} title="Add Replica">
                                            <ArrowUpDown className="w-3 h-3" />
                                        </Button>
                                    </Label>
                                    <div className="space-y-2">
                                        {replicationConfig.replicas?.map((replica, idx) => (
                                            <div key={idx} className="p-3 rounded-lg border border-slate-700 bg-slate-800/50 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                                                <div className="flex-1 min-w-0 space-y-1.5">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px]">Region</Label>
                                                            <Input
                                                                value={replica.region}
                                                                onChange={(e) => {
                                                                    const newReplicas = [...(replicationConfig.replicas || [])];
                                                                    newReplicas[idx] = { ...newReplicas[idx], region: e.target.value };
                                                                    updateConfig({ replication: { ...replicationConfig, replicas: newReplicas } });
                                                                }}
                                                                placeholder="region"
                                                                disabled={readOnly}
                                                                className="h-7 text-xs"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px]">Role</Label>
                                                            <Select
                                                                value={replica.role}
                                                                onValueChange={(v) => {
                                                                    const newReplicas = [...(replicationConfig.replicas || [])];
                                                                    newReplicas[idx] = { ...newReplicas[idx], role: v as any };
                                                                    updateConfig({ replication: { ...replicationConfig, replicas: newReplicas } });
                                                                }}
                                                                disabled={readOnly}
                                                            >
                                                                <SelectTrigger className="h-7 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="sync">Sync</SelectItem>
                                                                    <SelectItem value="async">Async</SelectItem>
                                                                    <SelectItem value="witness">Witness</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px]">Priority</Label>
                                                        <Slider
                                                            value={[replica.priority]}
                                                            min={1}
                                                            max={100}
                                                            step={1}
                                                            onValueChange={([v]) => {
                                                                const newReplicas = [...(replicationConfig.replicas || [])];
                                                                newReplicas[idx] = { ...newReplicas[idx], priority: v };
                                                                updateConfig({ replication: { ...replicationConfig, replicas: newReplicas } });
                                                            }}
                                                            disabled={readOnly}
                                                            className="w-full"
                                                        />
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 p-0 text-rose-400 hover:text-rose-300"
                                                    onClick={() => {
                                                        const newReplicas = (replicationConfig.replicas || []).filter((_, i) => i !== idx);
                                                        updateConfig({ replication: { ...replicationConfig, replicas: newReplicas } });
                                                    }}
                                                    disabled={readOnly || (replicationConfig.replicas?.length || 0) <= 1}
                                                    title="Remove Replica"
                                                >
                                                    <AlertTriangle className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* FAILOVER TAB */}
                    <TabsContent value="failover" className="space-y-4 pt-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Enable Automatic Failover</Label>
                                <p className="text-xs text-slate-500">Automatically promote replica on primary failure</p>
                            </div>
                            <Switch
                                checked={failoverConfig.enabled}
                                onCheckedChange={(v) => updateConfig({ failover: { ...failoverConfig, enabled: v } })}
                                disabled={readOnly}
                            />
                        </div>

                        {failoverConfig.enabled && (
                            <div className="space-y-4 border-t pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Failover Timeout (seconds)</Label>
                                        <Slider
                                            value={[failoverConfig.timeout]}
                                            min={10}
                                            max={300}
                                            step={5}
                                            onValueChange={([v]) => updateConfig({ failover: { ...failoverConfig, timeout: v } })}
                                            disabled={readOnly}
                                        />
                                        <p className="text-xs text-slate-500">{failoverConfig.timeout}s</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Max Retries</Label>
                                        <Slider
                                            value={[failoverConfig.maxRetries]}
                                            min={1}
                                            max={10}
                                            step={1}
                                            onValueChange={([v]) => updateConfig({ failover: { ...failoverConfig, maxRetries: v } })}
                                            disabled={readOnly}
                                        />
                                        <p className="text-xs text-slate-500">{failoverConfig.maxRetries}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Health Check Interval (seconds)</Label>
                                        <Slider
                                            value={[failoverConfig.healthCheckInterval]}
                                            min={5}
                                            max={60}
                                            step={5}
                                            onValueChange={([v]) => updateConfig({ failover: { ...failoverConfig, healthCheckInterval: v } })}
                                            disabled={readOnly}
                                        />
                                        <p className="text-xs text-slate-500">{failoverConfig.healthCheckInterval}s</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Promotion Policy</Label>
                                        <Select
                                            value={failoverConfig.promotionPolicy}
                                            onValueChange={(v) => updateConfig({ failover: { ...failoverConfig, promotionPolicy: v as any } })}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="priority">Priority Based</SelectItem>
                                                <SelectItem value="latency">Lowest Latency</SelectItem>
                                                <SelectItem value="manual">Manual Only</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* CONNECTION POOL TAB */}
                    <TabsContent value="pool" className="space-y-4 pt-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Enable Connection Pooling</Label>
                                <p className="text-xs text-slate-500">PgBouncer transaction-mode pooling</p>
                            </div>
                            <Switch
                                checked={poolConfig.enabled}
                                onCheckedChange={(v) => updateConfig({ connectionPool: { ...poolConfig, enabled: v } })}
                                disabled={readOnly}
                            />
                        </div>

                        {poolConfig.enabled && (
                            <div className="space-y-4 border-t pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Pool Type</Label>
                                        <Select
                                            value={poolConfig.type}
                                            onValueChange={(v) => updateConfig({ connectionPool: { ...poolConfig, type: v as any } })}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pgbouncer">PgBouncer (PostgreSQL)</SelectItem>
                                                <SelectItem value="proxysql">ProxySQL (MySQL)</SelectItem>
                                                <SelectItem value="haproxy">HAProxy (TCP)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Pool Mode</Label>
                                        <Select
                                            value={poolConfig.mode}
                                            onValueChange={(v) => updateConfig({ connectionPool: { ...poolConfig, mode: v as any } })}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="transaction">Transaction (Recommended)</SelectItem>
                                                <SelectItem value="session">Session</SelectItem>
                                                <SelectItem value="statement">Statement</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Pool Size</Label>
                                        <Slider
                                            value={[poolConfig.poolSize]}
                                            min={5}
                                            max={200}
                                            step={5}
                                            onValueChange={([v]) => updateConfig({ connectionPool: { ...poolConfig, poolSize: v } })}
                                            disabled={readOnly}
                                        />
                                        <p className="text-xs text-slate-500">{poolConfig.poolSize} connections</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Max Client Connections</Label>
                                        <Slider
                                            value={[poolConfig.maxConnections]}
                                            min={100}
                                            max={10000}
                                            step={100}
                                            onValueChange={([v]) => updateConfig({ connectionPool: { ...poolConfig, maxConnections: v } })}
                                            disabled={readOnly}
                                        />
                                        <p className="text-xs text-slate-500">{poolConfig.maxConnections}</p>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Idle Timeout (seconds)</Label>
                                    <Slider
                                        value={[poolConfig.idleTimeout]}
                                        min={60}
                                        max={3600}
                                        step={60}
                                        onValueChange={([v]) => updateConfig({ connectionPool: { ...poolConfig, idleTimeout: v } })}
                                        disabled={readOnly}
                                    />
                                    <p className="text-xs text-slate-500">{poolConfig.idleTimeout}s</p>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* LOAD BALANCER TAB */}
                    <TabsContent value="lb" className="space-y-4 pt-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Enable Load Balancer</Label>
                                <p className="text-xs text-slate-500">HAProxy TCP load balancing with health checks</p>
                            </div>
                            <Switch
                                checked={lbConfig.enabled}
                                onCheckedChange={(v) => updateConfig({ loadBalancer: { ...lbConfig, enabled: v } })}
                                disabled={readOnly}
                            />
                        </div>

                        {lbConfig.enabled && (
                            <div className="space-y-4 border-t pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Load Balancer Type</Label>
                                        <Select
                                            value={lbConfig.type}
                                            onValueChange={(v) => updateConfig({ loadBalancer: { ...lbConfig, type: v as any } })}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="haproxy">HAProxy (Recommended)</SelectItem>
                                                <SelectItem value="nginx">NGINX Stream</SelectItem>
                                                <SelectItem value="envoy">Envoy Proxy</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Algorithm</Label>
                                        <Select
                                            value={lbConfig.algorithm}
                                            onValueChange={(v) => updateConfig({ loadBalancer: { ...lbConfig, algorithm: v as any } })}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="round-robin">Round Robin</SelectItem>
                                                <SelectItem value="least-connections">Least Connections</SelectItem>
                                                <SelectItem value="ip-hash">IP Hash (Sticky)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Listen Port</Label>
                                        <Input
                                            type="number"
                                            value={lbConfig.port}
                                            onChange={(e) => updateConfig({ loadBalancer: { ...lbConfig, port: parseInt(e.target.value) } })}
                                            disabled={readOnly}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Target Port</Label>
                                        <Input
                                            type="number"
                                            value={lbConfig.targetPort}
                                            onChange={(e) => updateConfig({ loadBalancer: { ...lbConfig, targetPort: parseInt(e.target.value) } })}
                                            disabled={readOnly}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Health Check Path</Label>
                                    <Input
                                        value={lbConfig.healthCheckPath}
                                        onChange={(e) => updateConfig({ loadBalancer: { ...lbConfig, healthCheckPath: e.target.value } })}
                                        disabled={readOnly}
                                        className="h-8 text-xs font-mono"
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label>Sticky Sessions</Label>
                                        <p className="text-xs text-slate-500">Route same client to same backend (IP Hash)</p>
                                    </div>
                                    <Switch
                                        checked={lbConfig.stickySessions}
                                        onCheckedChange={(v) => updateConfig({ loadBalancer: { ...lbConfig, stickySessions: v } })}
                                        disabled={readOnly}
                                    />
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* BACKUP TAB */}
                    <TabsContent value="backup" className="space-y-4 pt-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Enable Automated Backups</Label>
                                <p className="text-xs text-slate-500">Scheduled pg_dump with retention</p>
                            </div>
                            <Switch
                                checked={backupConfig.enabled}
                                onCheckedChange={(v) => updateConfig({ backup: { ...backupConfig, enabled: v } })}
                                disabled={readOnly}
                            />
                        </div>

                        {backupConfig.enabled && (
                            <div className="space-y-4 border-t pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Schedule (Cron)</Label>
                                        <Input
                                            value={backupConfig.schedule}
                                            onChange={(e) => updateConfig({ backup: { ...backupConfig, schedule: e.target.value } })}
                                            placeholder="0 2 * * *"
                                            disabled={readOnly}
                                            className="h-8 text-xs font-mono"
                                        />
                                        <p className="text-[10px] text-slate-500">Daily at 2 AM UTC</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Retention (Days)</Label>
                                        <Slider
                                            value={[backupConfig.retentionDays]}
                                            min={1}
                                            max={90}
                                            step={1}
                                            onValueChange={([v]) => updateConfig({ backup: { ...backupConfig, retentionDays: v } })}
                                            disabled={readOnly}
                                        />
                                        <p className="text-xs text-slate-500">{backupConfig.retentionDays} days</p>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Storage Backend</Label>
                                    <Select
                                        value={backupConfig.storage}
                                        onValueChange={(v) => updateConfig({ backup: { ...backupConfig, storage: v as any } })}
                                        disabled={readOnly}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="local">Local Volume</SelectItem>
                                            <SelectItem value="s3" disabled>AWS S3 (Coming Soon)</SelectItem>
                                            <SelectItem value="gcs" disabled>Google Cloud Storage (Coming Soon)</SelectItem>
                                            <SelectItem value="azure" disabled>Azure Blob (Coming Soon)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label>Encryption (GPG)</Label>
                                            <p className="text-xs text-slate-500">Encrypt backup files at rest</p>
                                        </div>
                                        <Switch
                                            checked={backupConfig.encryption}
                                            onCheckedChange={(v) => updateConfig({ backup: { ...backupConfig, encryption: v } })}
                                            disabled={readOnly}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label>Point-in-Time Recovery</Label>
                                            <p className="text-xs text-slate-500">Include WAL files for PITR</p>
                                        </div>
                                        <Switch
                                            checked={backupConfig.pointInTimeRecovery}
                                            onCheckedChange={(v) => updateConfig({ backup: { ...backupConfig, pointInTimeRecovery: v } })}
                                            disabled={readOnly}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                {/* Save Button */}
                {!readOnly && (
                    <Button className="w-full" onClick={() => {}} disabled>
                        <Save className="w-3 h-3 mr-2" />
                        Save Configuration
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
