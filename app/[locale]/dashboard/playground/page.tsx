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

import {Suspense} from 'react';
import PlaygroundContent from "@/components/playground/playGroundContent";

// Main component with Suspense boundary
export default function Page() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PlaygroundContent />
        </Suspense>
    );
}