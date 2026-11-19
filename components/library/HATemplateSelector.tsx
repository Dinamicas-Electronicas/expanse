"use client"

import React, { useState, useMemo } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Database, Search, Filter, ChevronDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateService } from "@/types/library";

interface HATemplateSelectorProps {
    templates: TemplateService[];
    onSelect: (template: TemplateService) => void;
    selectedTemplate?: TemplateService;
    className?: string;
}

export function HATemplateSelector({ templates, onSelect, selectedTemplate, className }: HATemplateSelectorProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [showHAOnly, setShowHAOnly] = useState(true);

    const filteredTemplates = useMemo(() => {
        return templates.filter(template => {
            // HA filter
            if (showHAOnly && !template.haEnabled) return false;
            
            // Category filter
            if (selectedCategory !== 'All' && template.category !== selectedCategory) return false;
            
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const nameMatch = template.name.toLowerCase().includes(query);
                const descMatch = template.description?.toLowerCase().includes(query);
                const imageMatch = template.image.toLowerCase().includes(query);
                if (!nameMatch && !descMatch && !imageMatch) return false;
            }
            
            return true;
        });
    }, [templates, searchQuery, selectedCategory, showHAOnly]);

    const categories = useMemo(() => {
        const cats = new Set(templates.filter(t => t.haEnabled).map(t => t.category));
        return ['All', ...Array.from(cats).sort()];
    }, [templates]);

    const haTemplates = templates.filter(t => t.haEnabled);

    return (
        <Card className={cn('border-slate-800 bg-slate-900/50', className)}>
            <CardContent className="space-y-4 p-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-lg font-medium text-white">HA Templates</h3>
                        <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                            {haTemplates.length} HA-ready
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showHAOnly}
                                onChange={(e) => setShowHAOnly(e.target.checked)}
                                className="w-3 h-3 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500"
                            />
                            HA Only
                        </label>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            placeholder="Search templates..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 text-xs"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="pl-8 pr-8 h-8 text-xs bg-slate-800 border-slate-700 text-white rounded-lg appearance-none"
                        >
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                </div>

                {/* Results */}
                <div className="max-h-96 overflow-y-auto space-y-2">
                    {filteredTemplates.length === 0 ? (
                        <div className="py-8 text-center text-slate-500">
                            <Shield className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                            <p className="text-sm">No HA templates match your criteria</p>
                            <p className="text-[10px] mt-1">Try adjusting filters or search</p>
                        </div>
                    ) : (
                        filteredTemplates.map(template => (
                            <HAOptionCard
                                key={template.name}
                                template={template}
                                isSelected={selectedTemplate?.name === template.name}
                                onClick={() => onSelect(template)}
                            />
                        ))
                    )}
                </div>

                {/* Summary */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Showing {filteredTemplates.length} of {haTemplates.length} HA templates</span>
                    <span className="flex items-center gap-1">
                        {categories.filter(c => c !== 'All').map(cat => (
                            <Badge key={cat} variant="outline" className="text-[9px]">
                                {cat}: {templates.filter(t => t.category === cat && t.haEnabled).length}
                            </Badge>
                        ))}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

interface HAOptionCardProps {
    template: TemplateService;
    isSelected: boolean;
    onClick: () => void;
}

function HAOptionCard({ template, isSelected, onClick }: HAOptionCardProps) {
    const haConfig = template.databaseHA;
    const legacyConfig = template.databaseHa;
    const hasFullHA = !!template.databaseHA;
    const hasLegacyHA = !!legacyConfig && !haConfig;
    
    const replicationMode = haConfig?.replication?.mode || 'N/A';
    const replicaCount = haConfig?.replication?.replicas?.length || 0;
    const hasPool = haConfig?.connectionPool?.enabled || legacyConfig?.type === 'pgbouncer';
    const hasLB = haConfig?.loadBalancer?.enabled || (legacyConfig?.type as string | undefined) === 'haproxy';
    const hasBackup = haConfig?.backup?.enabled;

    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full text-left p-3 rounded-lg border transition-all duration-200',
                'hover:bg-slate-800/50',
                isSelected 
                    ? 'border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20' 
                    : 'border-slate-700 hover:border-slate-600'
            )}
        >
            <div className="flex items-start gap-3">
                {/* Logo/Icon */}
                <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-slate-800 border border-slate-700'
                )}>
                    {template.logo ? (
                        <Image
                            src={template.logo} 
                            alt={template.name} 
                            width={32}
                            height={32}
                            className="w-8 h-8 object-contain"
                            unoptimized
                            onError={(e) => e.currentTarget.style.display = 'none'}
                        />
                    ) : (
                        <Database className="w-6 h-6 text-slate-400" />
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white truncate">{template.name}</h4>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{template.description}</p>
                    
                    {/* HA Feature Badges */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant={hasFullHA ? "success" : hasLegacyHA ? "warning" : "outline"} className="text-[9px] px-1.5 py-0.5">
                            {hasFullHA ? 'Full HA' : hasLegacyHA ? 'Legacy HA' : 'Basic'}
                        </Badge>
                        {replicationMode !== 'N/A' && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">
                                {replicationMode} ×{replicaCount}
                            </Badge>
                        )}
                        {hasPool && <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">Pool</Badge>}
                        {hasLB && <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">LB</Badge>}
                        {hasBackup && <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">Backup</Badge>}
                    </div>

                    {/* Category */}
                    <div className="mt-1.5 flex items-center gap-1 text-[9px] text-slate-500">
                        <Database className="w-2.5 h-2.5" />
                        <span>{template.category}</span>
                        {template.isStack && (
                            <>
                                <span className="text-slate-600">·</span>
                                <span>Stack</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Selection indicator */}
                {isSelected && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-emerald-500 bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    </div>
                )}
            </div>
        </button>
    );
}
