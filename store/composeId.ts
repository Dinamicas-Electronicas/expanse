"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { create } from 'zustand';

// Define the type for the store's state
interface ComposeIdStoreState {
    id?: string|undefined;
    setId: (value: string|undefined) => void;
}

// Create the Zustand store
const useComposeIdStore = create<ComposeIdStoreState>((set) => ({
    id: undefined,
    setId: (value: string|undefined) => set({ id: value }),
}));

export default useComposeIdStore;