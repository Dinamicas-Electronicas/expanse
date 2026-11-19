"use client"

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Server, Shield, Database, Loader2, AlertCircle } from "lucide-react";
import type { DatabaseHAConfig } from "@/types/library";

interface HaDeploymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (haConfig: HaDeploymentConfig) => void;
    isLoading?: boolean;
    templateHaConfig?: DatabaseHAConfig | null; // Full HA config from template
}

export interface HaDeploymentConfig {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    enableLoadBalancer: boolean;
    enableConnectionPool: boolean;
}

export function HaDeploymentDialog({ open, onOpenChange, onConfirm, isLoading, templateHaConfig }: HaDeploymentDialogProps) {
    const [enabled, setEnabled] = useState(false);
    const [minReplicas, setMinReplicas] = useState(2);
    const [maxReplicas, setMaxReplicas] = useState(5);
    const [enableLoadBalancer, setEnableLoadBalancer] = useState(true);
    const [enableConnectionPool, setEnableConnectionPool] = useState(true);
    

    // Initialize from template HA config if available
    useEffect(() => {
        if (templateHaConfig && templateHaConfig.replication?.enabled) {
            setEnabled(true);
            if (templateHaConfig.replication?.replicas) {
                setMinReplicas(Math.max(2, templateHaConfig.replication.replicas.length));
                setMaxReplicas(Math.max(5, templateHaConfig.replication.replicas.length + 2));
            }
            if (templateHaConfig.connectionPool?.enabled) {
                setEnableConnectionPool(true);
            }
            if (templateHaConfig.loadBalancer?.enabled) {
                setEnableLoadBalancer(true);
            }
        } else {
            // Reset to defaults if no template config
            setEnabled(false);
            setMinReplicas(2);
            setMaxReplicas(5);
            setEnableLoadBalancer(true);
            setEnableConnectionPool(true);
        }
    }, [templateHaConfig]);

    const handleConfirm = () => {
        onConfirm({
            enabled,
            minReplicas,
            maxReplicas,
            enableLoadBalancer: enabled ? enableLoadBalancer : false,
            enableConnectionPool: enabled ? enableConnectionPool : false,
        });
    };

    const handleDeployWithoutHA = () => {
        onConfirm({
            enabled: false,
            minReplicas: 1,
            maxReplicas: 1,
            enableLoadBalancer: false,
            enableConnectionPool: false,
        });
    };

    const hasTemplateHA = !!templateHaConfig?.replication?.enabled;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="w-5 h-5" />
                        High Availability Deployment
                    </DialogTitle>
                    <DialogDescription>
                        {hasTemplateHA ? (
                            <>This stack includes a pre-configured HA setup. Choose to deploy with the recommended HA configuration or customize.</>
                        ) : (
                            <>Configure your application for high availability with multiple instances, load balancing, and connection pooling.</>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="ha-enabled">Enable High Availability</Label>
                            <p className="text-sm text-slate-500">
                                {hasTemplateHA 
                                    ? "Uses template's pre-configured HA setup (Patroni, HAProxy, PgBouncer)"
                                    : "Deploy with multiple replicas and automatic failover"}
                            </p>
                        </div>
                        <Switch
                            id="ha-enabled"
                            checked={enabled}
                            onCheckedChange={setEnabled}
                            disabled={hasTemplateHA}
                        />
                    </div>

                    {hasTemplateHA && !enabled && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400" />
                            <p className="text-sm text-amber-400">
                                This template has a recommended HA configuration. Disabling HA will deploy a single instance without failover.
                            </p>
                        </div>
                    )}

                    {enabled && (
                        <>
                            <div className="space-y-4 border-t pt-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <Shield className="w-4 h-4" />
                                    Autoscaling Configuration
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <Label>Minimum Replicas</Label>
                                        <span className="text-sm font-mono text-slate-600">{minReplicas}</span>
                                    </div>
                                    <Slider
                                        value={[minReplicas]}
                                        min={hasTemplateHA ? 3 : 2}
                                        max={maxReplicas}
                                        step={1}
                                        onValueChange={([v]) => setMinReplicas(v)}
                                    />
                                    <p className="text-xs text-slate-500">
                                        Minimum number of running instances
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <Label>Maximum Replicas</Label>
                                        <span className="text-sm font-mono text-slate-600">{maxReplicas}</span>
                                    </div>
                                    <Slider
                                        value={[maxReplicas]}
                                        min={minReplicas}
                                        max={10}
                                        step={1}
                                        onValueChange={([v]) => setMaxReplicas(v)}
                                    />
                                    <p className="text-xs text-slate-500">
                                        Maximum instances for autoscaling
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4 border-t pt-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <Server className="w-4 h-4" />
                                    Load Balancer
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label>HAProxy Load Balancer</Label>
                                        <p className="text-sm text-slate-500">
                                            Round-robin distribution with health checks
                                        </p>
                                    </div>
                                    <Switch
                                        checked={enableLoadBalancer}
                                        onCheckedChange={setEnableLoadBalancer}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4 border-t pt-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <Database className="w-4 h-4" />
                                    Connection Pooling
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label>PgBouncer</Label>
                                        <p className="text-sm text-slate-500">
                                            Transaction-mode pooling for PostgreSQL
                                        </p>
                                    </div>
                                    <Switch
                                        checked={enableConnectionPool}
                                        onCheckedChange={setEnableConnectionPool}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
                    <Button variant="outline" onClick={handleDeployWithoutHA} disabled={isLoading} className="flex-1">
                        Deploy without HA
                    </Button>
                    <Button onClick={handleConfirm} disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Deploying...
                            </>
                        ) : enabled ? (
                            <>Deploy with HA</>
                        ) : (
                            <>Deploy without HA</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
