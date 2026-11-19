/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

/**
 * This file is kept for compatibility but is no longer used.
 * The application has been migrated to use pure Next.js server actions.
 *
 * The safe-action client has been removed and all actions now use
 * native Next.js server action patterns with proper error handling.
 */

// Export a no-op client for backward compatibility if needed
export const actionClient = {
    schema: () => ({
        action: (fn: any) => fn
    })
};

export class PassToClientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PassToClientError";
    }
}
