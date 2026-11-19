/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { randomBytes } from 'crypto';

/**
 * Generate a unique token that is stored in memory
 * A new token is generated on each app run
 */
function generateUniqueToken(): string {
    return randomBytes(32).toString('hex');
}

// Initialize the token on module load
let exportRenderToken: string = generateUniqueToken();

/**
 * Get the in-memory export render token
 * A unique token is generated on each app run and kept in memory
 */
export function getExportRenderToken(): string {
    return exportRenderToken;
}

/**
 * Reset the token to a new random value
 * Mainly for testing purposes
 */
export function resetExportRenderToken(): void {
    exportRenderToken = generateUniqueToken();
    console.log('[ExportToken] Token reset to new value');
}
