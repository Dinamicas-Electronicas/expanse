/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    // CORE_ONLY mode: block all search engine indexing
    return {
        rules: [
            {
                userAgent: '*',
                disallow: '/',
            },
        ],
    }
}
