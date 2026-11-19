"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar, RotateCcw, AlertCircle, Loader2 } from "lucide-react";
import { format, parseISO, subMinutes, isBefore, isAfter } from "date-fns";

interface PointInTimeRestoreProps {
    backupFileName: string;
    backupCreatedAt: string;
    minTimestamp: string;  // Earliest point available (from WAL)
    maxTimestamp: string;  // Latest point available (backup completion)
    onRestore: (timestamp: string) => Promise<void>;
    onClose: () => void;
    isOpen: boolean;
}

export function PointInTimeRestore({ 
    backupFileName, 
    backupCreatedAt, 
    minTimestamp, 
    maxTimestamp, 
    onRestore, 
    onClose,
    isOpen 
}: PointInTimeRestoreProps) {
    const [selectedTimestamp, setSelectedTimestamp] = useState<string>(maxTimestamp);
    const [restoring, setRestoring] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const minDate = parseISO(minTimestamp);
    const maxDate = parseISO(maxTimestamp);

    const isValidTimestamp = (ts: string) => {
        const date = parseISO(ts);
        return !isBefore(date, minDate) && !isAfter(date, maxDate);
    };

    const handleQuickSelect = (minutesAgo: number) => {
        const ts = format(subMinutes(maxDate, minutesAgo), "yyyy-MM-dd'T'HH:mm:ss");
        if (isValidTimestamp(ts)) {
            setSelectedTimestamp(ts);
        }
    };

    const handleRestore = async () => {
        if (!isValidTimestamp(selectedTimestamp)) {
            setError('Selected timestamp is outside available range');
            return;
        }

        setRestoring(true);
        setError(null);

        try {
            await onRestore(selectedTimestamp);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Restore failed');
        } finally {
            setRestoring(false);
        }
    };

    const formatDisplay = (ts: string) => format(parseISO(ts), 'PPP p');

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RotateCcw className="w-5 h-5 text-amber-400" />
                        Point-in-Time Restore
                    </DialogTitle>
                    <DialogDescription>
                        Restore database to a specific moment from backup <strong>{backupFileName}</strong>.
                        Available range: {formatDisplay(minTimestamp)} → {formatDisplay(maxTimestamp)}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Backup Info */}
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-slate-400">Backup:</span>
                            <span className="font-mono text-white truncate flex-1">{backupFileName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm mt-1">
                            <span className="text-slate-400">Completed:</span>
                            <span className="text-white">{formatDisplay(backupCreatedAt)}</span>
                        </div>
                    </div>

                    {/* Timestamp Selection */}
                    <div className="space-y-2">
                        <Label>Restore Point</Label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <Input
                                type="datetime-local"
                                value={selectedTimestamp}
                                onChange={(e) => setSelectedTimestamp(e.target.value)}
                                min={format(minDate, "yyyy-MM-dd'T'HH:mm")}
                                max={format(maxDate, "yyyy-MM-dd'T'HH:mm")}
                                className="pl-10 h-10 text-sm"
                                step={60}
                            />
                        </div>
                        {!isValidTimestamp(selectedTimestamp) && (
                            <p className="text-xs text-rose-400 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Timestamp must be between {formatDisplay(minTimestamp)} and {formatDisplay(maxTimestamp)}
                            </p>
                        )}

                        {/* Quick Select Buttons */}
                        <div className="flex flex-wrap gap-2">
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleQuickSelect(0)}
                                className="text-[10px]"
                            >
                                Latest ({formatDisplay(maxTimestamp)})
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleQuickSelect(5)}
                                className="text-[10px]"
                            >
                                5 min ago
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleQuickSelect(15)}
                                className="text-[10px]"
                            >
                                15 min ago
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleQuickSelect(60)}
                                className="text-[10px]"
                            >
                                1 hour ago
                            </Button>
                        </div>
                    </div>

                    {/* Timeline Visualization */}
                    <div className="space-y-2">
                        <Label>Timeline</Label>
                        <div className="relative h-16">
                            {/* Timeline track */}
                            <div className="absolute top-1/2 left-8 right-8 -translate-y-1/2 h-1 bg-slate-700 rounded-full" />
                            
                            {/* Min marker */}
                            <div className="absolute left-8 top-0 flex flex-col items-center">
                                <div className="w-2 h-2 rounded-full bg-slate-500" />
                                <span className="text-[9px] text-slate-500 mt-1">{formatDisplay(minTimestamp)}</span>
                            </div>
                            
                            {/* Max marker */}
                            <div className="absolute right-8 top-0 flex flex-col items-center">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-[9px] text-slate-500 mt-1">{formatDisplay(maxTimestamp)}</span>
                            </div>
                            
                            {/* Selected position */}
                            {isValidTimestamp(selectedTimestamp) && (
                                <div className="absolute top-0 bottom-0" style={{ 
                                    left: `calc(8px + ${((new Date(selectedTimestamp).getTime() - minDate.getTime()) / (maxDate.getTime() - minDate.getTime())) * 100}%)` 
                                }}>
                                    <div className="absolute top-1/2 -translate-y-1/2 left-0 w-3 h-3 -translate-x-1/2 rounded-full bg-amber-400 border-2 border-slate-900 shadow-lg" />
                                    <div className="absolute top-full left-0 mt-1 w-20 -translate-x-1/2 text-center">
                                        <span className="text-[9px] text-amber-400 font-mono">{formatDisplay(selectedTimestamp)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* WAL Info */}
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                        <div className="flex items-center gap-1.5 mb-1">
                            <AlertCircle className="w-4 h-4" />
                            <span className="font-medium">Point-in-Time Recovery Requirements</span>
                        </div>
                        <ul className="ml-4 list-disc space-y-1 text-[10px]">
                            <li>Requires WAL archiving enabled in backup config</li>
                            <li>WAL files must be available from backup time to selected timestamp</li>
                            <li>Restore will replay transactions up to the selected point</li>
                            <li>Current database will be completely replaced</li>
                        </ul>
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={restoring}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleRestore} 
                        disabled={restoring || !isValidTimestamp(selectedTimestamp)}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-900"
                    >
                        {restoring ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Restoring...
                            </>
                        ) : (
                            <>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Restore to {formatDisplay(selectedTimestamp)}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}