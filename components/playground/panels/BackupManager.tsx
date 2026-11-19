"use client"

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
    Database, 
    RotateCcw, 
    Trash2, 
    Clock, 
    AlertCircle, 
    CheckCircle, 
    Loader2, 
    Calendar,
    HardDrive,
    Shield,
    Search,
    Filter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerBackup, listBackups, restoreBackup, type BackupInfo, type RestoreResult } from "@/actions/databaseHA";
import { format } from "date-fns";

interface BackupManagerProps {
    composeId: string;
    haEnabled?: boolean;
    onBackupComplete?: (backup: BackupInfo) => void;
    onRestoreComplete?: (result: RestoreResult) => void;
}

export function BackupManager({ 
    composeId, 
    haEnabled = false,
    onBackupComplete,
    onRestoreComplete 
}: BackupManagerProps) {
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [showRestoreDialog, setShowRestoreDialog] = useState<BackupInfo | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed' | 'in_progress'>('all');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadBackups = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await listBackups(composeId);
            if (Array.isArray(result)) {
                setBackups(result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            } else if ('error' in result) {
                setError(result.error);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load backups');
        } finally {
            setLoading(false);
        }
    }, [composeId]);

    useEffect(() => {
        if (composeId) {
            loadBackups();
        }
    }, [composeId, loadBackups]);

    const handleCreateBackup = async () => {
        if (!haEnabled) {
            setError('HA backup not enabled for this compose. Enable HA with backup in configuration.');
            return;
        }

        setCreating(true);
        setError(null);
        setSuccess(null);
        
        try {
            const result = await triggerBackup(composeId);
            if (result.success) {
                setSuccess(`Backup created: ${result.fileName}`);
                onBackupComplete?.({
                    id: result.backupId || '',
                    fileName: result.fileName || '',
                    size: result.size || 'unknown',
                    createdAt: new Date().toISOString(),
                    type: 'full',
                    status: 'completed'
                });
                await loadBackups();
            } else {
                setError(result.error || 'Backup failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Backup failed');
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async (backup: BackupInfo) => {
        setRestoring(backup.id);
        setError(null);
        setSuccess(null);
        setShowRestoreDialog(null);

        try {
            const result = await restoreBackup(composeId, backup.id);
            if (result.success) {
                setSuccess(`Restored from ${backup.fileName}`);
                onRestoreComplete?.(result);
            } else {
                setError(result.error || 'Restore failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Restore failed');
        } finally {
            setRestoring(null);
        }
    };

    const handleDelete = async (backupId: string) => {
        if (!window.confirm('Are you sure you want to delete this backup? This action cannot be undone.')) {
            return;
        }

        setDeleting(backupId);
        setError(null);
        
        try {
            // Note: deleteBackup action would need to be implemented
            // For now, just remove from local state
            setBackups(prev => prev.filter(b => b.id !== backupId));
            setSuccess('Backup deleted (local only)');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setDeleting(null);
        }
    };

    const filteredBackups = backups
        .filter(b => {
            if (statusFilter !== 'all' && b.status !== statusFilter) return false;
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return b.fileName.toLowerCase().includes(query) || b.id.toLowerCase().includes(query);
            }
            return true;
        });

    const getStatusConfig = (status: BackupInfo['status']) => {
        switch (status) {
            case 'completed':
                return { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle };
            case 'failed':
                return { label: 'Failed', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: AlertCircle };
            case 'in_progress':
                return { label: 'In Progress', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Loader2 };
            default:
                return { label: status, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', icon: Database };
        }
    };

    const formatSize = (size: string) => {
        if (size === 'unknown') return 'Unknown';
        const bytes = parseInt(size);
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    };

    if (!haEnabled) {
        return (
            <Card className="border-slate-800 bg-slate-900/50">
                <CardContent className="py-8 text-center">
                    <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">HA Backup Not Enabled</h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">
                        Enable HA with backup configuration in the HA panel to use backup management features.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-400" />
                        Backup Manager
                    </CardTitle>
                    <Button 
                        onClick={handleCreateBackup} 
                        disabled={creating || loading}
                        className="gap-2"
                    >
                        <Database className="w-4 h-4" />
                        {creating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Backup'
                        )}
                    </Button>
                </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
                {/* Error/Success Messages */}
                {error && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-sm text-rose-400">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error}</span>
                        <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
                    </div>
                )}
                {success && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircle className="w-4 h-4" />
                        <span>{success}</span>
                        <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>Dismiss</Button>
                    </div>
                )}

                {/* Search & Filter */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            placeholder="Search backups..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 text-xs"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="pl-8 pr-8 h-8 text-xs bg-slate-800 border-slate-700 text-white rounded-lg appearance-none"
                        >
                            <option value="all">All Status</option>
                            <option value="completed">Completed</option>
                            <option value="failed">Failed</option>
                            <option value="in_progress">In Progress</option>
                        </select>
                    </div>
                </div>

                {/* Backups List */}
                {loading ? (
                    <div className="py-8 text-center">
                        <Loader2 className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-spin" />
                        <p className="text-sm text-slate-500">Loading backups...</p>
                    </div>
                ) : filteredBackups.length === 0 ? (
                    <div className="py-8 text-center">
                        <Database className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">No backups found</p>
                        <p className="text-[10px] text-slate-600 mt-1">Create your first backup to get started</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {filteredBackups.map(backup => {
                            const statusConfig = getStatusConfig(backup.status);
                            const StatusIcon = statusConfig.icon;
                            const isRestoring = restoring === backup.id;
                            const isDeleting = deleting === backup.id;

                            return (
                                <div key={backup.id} className="p-3 rounded-lg border border-slate-700 bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={cn(
                                            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                                            statusConfig.bg,
                                            statusConfig.border
                                        )}>
                                            <StatusIcon className={cn('w-5 h-5', statusConfig.color)} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-sm text-white truncate max-w-[200px]" title={backup.fileName}>
                                                    {backup.fileName}
                                                </span>
                                                <Badge variant="outline" className={cn('text-[9px]', statusConfig.color.replace('text-', ''), statusConfig.border)}>
                                                    <StatusIcon className="w-2.5 h-2.5 mr-1" />
                                                    {statusConfig.label}
                                                </Badge>
                                                <Badge variant="secondary" className="text-[9px]">
                                                    {backup.type}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-[10px] text-slate-400 flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {format(new Date(backup.createdAt), 'PPP p')}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <HardDrive className="w-3 h-3" />
                                                    {formatSize(backup.size)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {backup.status === 'completed' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setShowRestoreDialog(backup)}
                                                disabled={isRestoring || isDeleting}
                                                title="Restore"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(backup.id)}
                                            disabled={isRestoring || isDeleting}
                                            className="text-rose-400 hover:text-rose-300"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Restore Dialog */}
                <Dialog open={!!showRestoreDialog} onOpenChange={(open) => !open && setShowRestoreDialog(null)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <RotateCcw className="w-5 h-5 text-amber-400" />
                                Restore Backup
                            </DialogTitle>
                            <DialogDescription>
                                Restore database from <strong>{showRestoreDialog?.fileName}</strong> created on {showRestoreDialog ? format(new Date(showRestoreDialog.createdAt), 'PPP p') : ''}.
                                <br />
                                <strong className="text-rose-400">Warning:</strong> This will overwrite current database data.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-1.5">
                                <Label>Restore Type</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant="outline"
                                        className="h-20 flex-col gap-1"
                                         onClick={() => handleRestore(showRestoreDialog!)}
                                    >
                                        <Database className="w-5 h-5" />
                                        <span className="font-medium">Full Restore</span>
                                        <span className="text-[10px] text-slate-500">Complete backup</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="h-20 flex-col gap-1"
                                        onClick={() => {
                                            // Point-in-time would need additional UI for timestamp selection
                                            alert('Point-in-time restore requires WAL files and timestamp selection (coming soon)');
                                        }}
                                        disabled={!showRestoreDialog || showRestoreDialog.status !== 'completed'}
                                    >
                                        <Clock className="w-5 h-5" />
                                        <span className="font-medium">Point-in-Time</span>
                                        <span className="text-[10px] text-slate-500">Specific timestamp</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="ghost" onClick={() => setShowRestoreDialog(null)}>
                                Cancel
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}
