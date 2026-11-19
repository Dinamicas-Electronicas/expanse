"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { create } from 'zustand';
import { Compose, Translator, Service, Env, Binding, Image, PortMapping, SuperSet, KeyValue, Network } from "expanse-docker-lib";
import { generateRandomName } from "@/lib/utils";
import { registerCompose } from "@/actions/userActions";
import { toPng } from 'html-to-image';
import useComposeIdStore from "@/store/composeId";
import toast from "react-hot-toast";
import usePositionMap from "@/store/metadataMap";
import { extractMetadata } from "@/lib/metadata";
import { sanitizeDockerName } from "@/lib/dockerCompose";
import { parseImageRef } from "@/lib/imageRef";
import useDisableStateStore from "@/store/disabled";
import { TemplateService } from "@/types/library";
import { useSystemStore } from "@/store/systemStore";
import useSelectionStore from "@/store/selection";
import { DatabaseHAConfig } from "@/types/library";
import { useHAStore } from "@/store/ha";

interface ComposeState {
    compose: Compose;
    tick: number;
    isDirty: boolean;
    lastSavedAt: number | null;
    haConfig: DatabaseHAConfig | null;
    haEnabled: boolean;
    setCompose: (updater: (currentCompose: Compose) => void) => Promise<boolean>;
    replaceCompose: (newCompose: Compose, options?: { disableSave?: boolean }) => void;
    addServiceFromTemplate: (template: TemplateService) => Promise<void>;
    addServiceFromImage: (imageName: string) => Promise<void>;
    resetCompose: () => void;
    setLastSavedAt: (value: number | null) => void;
    setHAConfig: (config: DatabaseHAConfig | null) => void;
    setHAEnabled: (enabled: boolean) => void;
}

export async function save(compose: Compose, targetId?: string) {
    const { id: currentId, setId } = useComposeIdStore.getState();
    // Use the id captured when the save was scheduled: a debounced save must
    // never write project A's data into project B after a quick navigation.
    const composeId = targetId ?? currentId;
    const translator = new Translator(compose);
    // Capture screenshot client-side
    let imageBase64: string | undefined = undefined;
    if (typeof document !== 'undefined') {
        try {
            const playgroundElement = document.querySelector('.react-flow__renderer') as HTMLElement;
            if (playgroundElement) {
                imageBase64 = await toPng(playgroundElement, {
                    backgroundColor: '#0a0d14',
                    width: 1200,
                    height: 800,
                    style: {
                        transform: 'scale(1)',
                    }
                });
            }
        } catch (error) {
            console.error("Failed to capture playground screenshot:", error);
        }
    }

    const saved = await registerCompose(
        translator.toDict(),
        extractMetadata(compose, usePositionMap.getState().positionMap),
        composeId,
        imageBase64,
        useComposeStore.getState().lastSavedAt ?? undefined,
    );
    setId(saved.id);

    // After successful save, mark as clean and remember the version.
    useComposeStore.setState({ isDirty: false, lastSavedAt: saved.updatedAt });

    // Persist ID in URL to ensure F5 doesn't lose the project
    if (typeof window !== 'undefined' && saved.id) {
        const url = new URL(window.location.href);
        if (url.searchParams.get('id') !== saved.id) {
            url.searchParams.set('id', saved.id);
            window.history.pushState({}, '', url.toString());
        }
    }
}

// Debounce helper for saving
let saveTimeout: NodeJS.Timeout | null = null;
const cancelPendingSave = () => {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }
};
const debouncedSave = (compose: Compose, targetId?: string) => {
    cancelPendingSave();
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        toast.promise(
            save(compose, targetId),
            {
                loading: 'Saving...',
                success: "Saved",
                error: (err: any) => err?.message === 'SAVE_CONFLICT'
                    ? 'This project changed in another tab. Reload before saving.'
                    : 'Error on save'
            }
        );
    }, 2000);
};

// Immediate save for beforeunload. A Server Action cannot be awaited while the
// page is unloading, so use a keepalive beacon to a dedicated endpoint.
const immediateSave = (compose: Compose) => {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    const composeId = useComposeIdStore.getState().id;
    if (!composeId) return;

    const payload = JSON.stringify({
        id: composeId,
        compose: new Translator(compose).toDict(),
        metadata: extractMetadata(compose, usePositionMap.getState().positionMap),
        expectedUpdatedAt: useComposeStore.getState().lastSavedAt ?? undefined,
    });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/compose/save', new Blob([payload], { type: 'application/json' }));
        return;
    }

    save(compose).catch(err => {
        console.error("Failed to save on unload:", err);
    });
};

// Setup beforeunload handler once
let beforeunloadHandlerSetup = false;
const setupBeforeUnloadHandler = () => {
    if (typeof window !== 'undefined' && !beforeunloadHandlerSetup) {
        beforeunloadHandlerSetup = true;
        window.addEventListener('beforeunload', () => {
            const { isDirty, compose } = useComposeStore.getState();
            const { state: disabledSave } = useDisableStateStore.getState();
            if (isDirty && !disabledSave) {
                immediateSave(compose);
            }
        });
    }
};

export const useComposeStore = create<ComposeState>((set, get) => {
    // Setup beforeunload handler on first store access
    setupBeforeUnloadHandler();

    return {
        compose: new Compose({ name: generateRandomName() }),
        tick: 0,
        isDirty: false,
        lastSavedAt: null,
        haConfig: null,
        haEnabled: false,
        setLastSavedAt: (value: number | null) => set({ lastSavedAt: value }),
        setCompose: async (updater: (currentCompose: Compose) => void) => {
            const { state: disabledSave } = useDisableStateStore.getState();
            const { compose, tick } = get();

            const previousHash = compose.hash();
            updater(compose);
            const newHash = compose.hash();
            const hasChanged = newHash !== previousHash;

            if (hasChanged) {
                set({ tick: tick + 1, isDirty: true });
                if (!disabledSave) {
                    debouncedSave(compose, useComposeIdStore.getState().id);
                }
            }
            return hasChanged;
        },
        replaceCompose: (newCompose: Compose, options?: { disableSave?: boolean }) => {
            // A pending save belongs to the project we are leaving.
            cancelPendingSave();
            const { state: disabledSaveGlobal } = useDisableStateStore.getState();
            const disableSave = options?.disableSave ?? disabledSaveGlobal;

            if (!newCompose.name) {
                newCompose.name = generateRandomName();
            }

            set({ compose: newCompose, tick: get().tick + 1, isDirty: !disableSave, lastSavedAt: null, haConfig: null, haEnabled: false });

            if (!disableSave) {
                debouncedSave(newCompose, useComposeIdStore.getState().id);
            }
        },
        resetCompose: () => {
            cancelPendingSave();
            const newCompose = new Compose({ name: generateRandomName() });
            const previousId = useComposeIdStore.getState().id;
            set({
                compose: newCompose,
                tick: get().tick + 1,
                isDirty: false,
                lastSavedAt: null,
                haConfig: null,
                haEnabled: false
            });

            // Reset metadata, selection and ID
            useComposeIdStore.getState().setId(undefined);
            useSelectionStore.getState().setSelectedString("");
            usePositionMap.getState().setPositionMap(new Map());
            usePositionMap.getState().setConnectionMap(new Map());

            // Clear HA store for the project we just left.
            if (previousId) {
                useHAStore.getState().clearHAConfig(previousId);
                useHAStore.getState().stopPolling(previousId);
            }

            // Clean URL
            if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.delete('id');
                window.history.replaceState({}, '', url.toString());
            }
        },
        setHAConfig: (config: DatabaseHAConfig | null) => {
            set({ haConfig: config });
            if (config) {
                useHAStore.getState().setHAConfig(useComposeIdStore.getState().id || '', config);
            }
        },
        setHAEnabled: (enabled: boolean) => {
            set({ haEnabled: enabled });
        },
        addServiceFromTemplate: async (template: TemplateService) => {
            const { setCompose } = useComposeStore.getState();

            const stackSuffix = generateRandomName().substring(0, 4);

            // Save HA config from template if available
            if (template.databaseHA && template.haEnabled) {
                get().setHAConfig(template.databaseHA);
                get().setHAEnabled(true);
            } else if (template.databaseHa && template.haEnabled) {
                // Legacy HA config
                const legacyConfig: DatabaseHAConfig = {
                    replication: template.databaseHa.type === 'patroni' ? {
                        enabled: true,
                        mode: 'async',
                        primaryRegion: 'primary',
                        replicas: [{ region: 'replica-1', role: 'async', priority: 50 }]
                    } : undefined,
                    failover: { enabled: true, timeout: 30, maxRetries: 3, healthCheckInterval: 10, promotionPolicy: 'priority' },
                    connectionPool: { enabled: template.databaseHa.type === 'pgbouncer', type: 'pgbouncer', mode: template.databaseHa.poolMode || 'transaction', poolSize: template.databaseHa.poolSize || 25, maxConnections: template.databaseHa.maxConnections || 1000, idleTimeout: 600 },
                    loadBalancer: { enabled: false, type: 'haproxy', algorithm: 'round-robin', healthCheckPath: '/health', stickySessions: false, port: 5432, targetPort: 5432 },
                    backup: { enabled: true, schedule: '0 2 * * *', retentionDays: 7, storage: 'local', encryption: true, pointInTimeRecovery: true }
                };
                get().setHAConfig(legacyConfig);
                get().setHAEnabled(true);
            }

            const createService = (tmp: TemplateService, isRelated = false): Service => {
                const imageRef = parseImageRef(tmp.image);
                const newEnvironment = new SuperSet<Readonly<Env>>();
                const newPorts: PortMapping[] = [];
                const newBindings = new SuperSet<Binding>();

                if (tmp.env_vars) {
                    Object.entries(tmp.env_vars).forEach(([key, value]) => {
                        newEnvironment.add(new Env(key, value));
                    });
                }

                if (tmp.default_ports) {
                    const { usedPorts } = useSystemStore.getState();
                    tmp.default_ports.forEach(p => {
                        const [hostPortStr, containerPortStr] = p.split(':');
                        let hostPort = parseInt(hostPortStr);
                        const containerPort = parseInt(containerPortStr);

                        if (usedPorts.includes(hostPort)) {
                            let newPort = hostPort + 1;
                            while (usedPorts.includes(newPort)) {
                                newPort++;
                            }
                            hostPort = newPort;
                            useSystemStore.setState({ usedPorts: [...usedPorts, hostPort] });
                        }
                        newPorts.push(new PortMapping({ hostPort, containerPort }));
                    });
                }

                if (tmp.volumes) {
                    tmp.volumes.forEach(v => {
                        const [source, target] = v.split(':');
                        newBindings.add(new Binding({ source, target }));
                    });
                }

                const baseName = sanitizeDockerName(tmp.name, 'service');
                // Use the consistent stack suffix
                const finalName = isRelated && baseName.length < 8 ? baseName : baseName + "_" + stackSuffix;

                return new Service({
                    name: finalName,
                    image: new Image({ name: imageRef.name, tag: imageRef.tag }),
                    environment: newEnvironment.size > 0 ? newEnvironment : undefined,
                    ports: newPorts.length > 0 ? newPorts : undefined,
                    bindings: newBindings.size > 0 ? newBindings : undefined,
                    labels: tmp.logo ? [new KeyValue("com.expanse.logo", tmp.logo)] : undefined,
                    command: typeof tmp.command === 'string' ? [tmp.command] : tmp.command
                });
            };

            await setCompose((compose) => {
                const addNetwork = !!template.related_services;
                let stackNetwork: Network | undefined;
                if (addNetwork) {
                    // Compose requires `[a-zA-Z0-9._-]+`; stack names such as
                    // "WordPress (Fullstack)" used to produce an invalid key.
                    const netName = `${sanitizeDockerName(template.name, 'stack')}_net`;
                    stackNetwork = new Network({ name: netName });
                    compose.addNetwork(stackNetwork);
                }

                const mainService = createService(template);
                if (stackNetwork) {
                    mainService.networks = new SuperSet<Network>([stackNetwork]);
                }
                compose.addService(mainService);

                const allServices: Service[] = [mainService];
                const nameMap = new Map<string, string>();

                // Add main service to name map
                const mainBaseName = sanitizeDockerName(template.name, 'service');
                nameMap.set(mainBaseName, mainService.name);

                if (template.related_services) {
                    template.related_services.forEach(rel => {
                        const relService = createService(rel, true);
                        if (stackNetwork) {
                            relService.networks = new SuperSet<Network>([stackNetwork]);
                        }

                        const baseName = sanitizeDockerName(rel.name, 'service');
                        nameMap.set(baseName, relService.name);

                        allServices.push(relService);
                        compose.addService(relService);
                        // Automatically make the main service depend on the related one
                        mainService.depends_on.add(relService);
                    });
                }

                // Update all services (main + related) environment and commands with dynamically generated names
                allServices.forEach(srv => {
                    // Update Environment
                    if (srv.environment) {
                        const updatedEnv = new SuperSet<Readonly<Env>>();
                        srv.environment.forEach(env => {
                            let newValue = env.value;
                            if (newValue && nameMap.has(newValue)) {
                                newValue = nameMap.get(newValue) as string;
                            } else if (newValue) {
                                nameMap.forEach((finalName, originalName) => {
                                    // 1. Replace bracketed placeholders like ${service} -> service_xyz
                                    const placeholderRegex = new RegExp(`\\$\\{${originalName}\\}`, 'g');
                                    newValue = newValue!.replace(placeholderRegex, finalName);

                                    // 2. Replace bare names with boundaries (avoiding protocol schemes)
                                    const bareRegex = new RegExp(`(?<=[@\\/:]|\\s|^)${originalName}(?=[@\\/:]|\\s|$)(?!:\\/\\/)`, 'g');
                                    newValue = newValue!.replace(bareRegex, finalName);
                                });
                            }
                            updatedEnv.add(new Env(env.key, newValue));
                        });
                        srv.environment = updatedEnv;
                    }

                    // Update Command
                    if (srv.command) {
                        if (Array.isArray(srv.command)) {
                            srv.command = (srv.command as string[]).map(cmdPart => {
                                let newPart = cmdPart;
                                nameMap.forEach((finalName, originalName) => {
                                    const placeholderRegex = new RegExp(`\\$\\{${originalName}\\}`, 'g');
                                    newPart = newPart.replace(placeholderRegex, finalName);

                                    const bareRegex = new RegExp(`(?<=[@\\/:]|\\s|^)${originalName}(?=[@\\/:]|\\s|$)(?!:\\/\\/)`, 'g');
                                    newPart = newPart.replace(bareRegex, finalName);
                                });
                                return newPart;
                            });
                        } else {
                            let newCommand = srv.command as unknown as string;
                            nameMap.forEach((finalName, originalName) => {
                                const placeholderRegex = new RegExp(`\\$\\{${originalName}\\}`, 'g');
                                newCommand = newCommand.replace(placeholderRegex, finalName);

                                const bareRegex = new RegExp(`(?<=[@\\/:]|\\s|^)${originalName}(?=[@\\/:]|\\s|$)(?!:\\/\\/)`, 'g');
                                newCommand = newCommand.replace(bareRegex, finalName);
                            });
                            srv.command = newCommand as any;
                        }
                    }
                });
            });

            toast.success(`${template.name} added to compose`);
        },

        addServiceFromImage: async (imageName: string) => {
            const { setCompose } = useComposeStore.getState();
            const stackSuffix = generateRandomName().substring(0, 4);

            const imageRef = parseImageRef(imageName);
            const imgName = imageRef.name;
            const imgTag = imageRef.tag;

            const baseName = imgName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            const finalName = baseName.length < 8 ? baseName : baseName + "_" + stackSuffix;

            await setCompose((compose) => {
                const service = new Service({
                    name: finalName,
                    image: new Image({ name: imgName, tag: imgTag }),
                });
                compose.addService(service);
            });

            toast.success(`${imageName} added to compose`);
        },
    };
});
