"use client"

import { useCallback } from 'react';
import { useComposeStore } from "@/store/compose";
import { useHAStore } from "@/store/ha";
import { getHAStatus, type HAStatusResponse } from "@/actions/databaseHA";

export interface UseHASyncOptions {
    composeId: string;
    onStatusLoaded?: (status: HAStatusResponse) => void;
    onError?: (error: Error) => void;
}

export function useHASync({ composeId, onStatusLoaded, onError }: UseHASyncOptions) {
    const { setHAConfig, setHAEnabled } = useComposeStore();
    const { setHAStatus } = useHAStore();

    const syncFromServer = useCallback(async () => {
        if (!composeId) return;
        
        try {
            const result = await getHAStatus(composeId);
            
            if ('error' in result) {
                // No HA config on server
                setHAConfig(null);
                setHAEnabled(false);
                return;
            }
            
            // Update local HA store with server status
            setHAStatus(composeId, result);
            
            // If server has HA enabled, we should have the config in the compose document
            // The config would be synced when the compose is loaded via userActions.getComposeById
            // For now, we just track the status
            
            if (result.haEnabled) {
                setHAEnabled(true);
                onStatusLoaded?.(result);
            }
        } catch (error) {
            onError?.(error as Error);
        }
    }, [composeId, setHAConfig, setHAEnabled, setHAStatus, onStatusLoaded, onError]);

    return { syncFromServer };
}

// Hook to initialize HA store from compose document
export function useHAInit() {
    const { setHAConfig: storeSetHAConfig, clearHAConfig } = useHAStore();

    const initFromCompose = useCallback((composeId: string, haConfig: any, haEnabled: boolean) => {
        if (haEnabled && haConfig) {
            storeSetHAConfig(composeId, haConfig);
        } else {
            clearHAConfig(composeId);
        }
    }, [storeSetHAConfig, clearHAConfig]);

    return { initFromCompose };
}
