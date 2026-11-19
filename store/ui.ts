/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { create } from 'zustand';

interface UIState {
    isLibraryOpen: boolean;
    libraryCategory?: string;
    setIsLibraryOpen: (isOpen: boolean, category?: string) => void;
}

const useUIStore = create<UIState>((set) => ({
    isLibraryOpen: false,
    libraryCategory: undefined,
    setIsLibraryOpen: (isOpen, category) => set({ isLibraryOpen: isOpen, libraryCategory: category }),
}));

export default useUIStore;
