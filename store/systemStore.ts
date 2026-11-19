/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { create } from 'zustand';
import { getUsedDockerPorts } from '@/actions/dockerActions';

interface SystemState {
    usedPorts: number[];
    fetchUsedPorts: () => Promise<void>;
}

export const useSystemStore = create<SystemState>((set) => ({
    usedPorts: [],
    fetchUsedPorts: async () => {
        const ports = await getUsedDockerPorts();
        set({ usedPorts: ports });
    }
}));
