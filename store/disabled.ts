"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { create } from 'zustand';

// Define the type for the store's state
interface saveDisabledState {
    state: boolean
    setState: (value: boolean) => void;
}

// Create the Zustand store
const useDisableStateStore = create<saveDisabledState>((set) => ({
    state: true,
    setState: (value: boolean) => set({ state: value }),
}));

export default useDisableStateStore;