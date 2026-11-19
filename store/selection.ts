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
interface SelectionStoreState {
    selectedId: string;
    setSelectedString: (value: string) => void;
}

// Create the Zustand store
const useSelectionStore = create<SelectionStoreState>((set) => ({
    selectedId: '',
    setSelectedString: (value: string) => set({ selectedId: value }),
}));

export default useSelectionStore;