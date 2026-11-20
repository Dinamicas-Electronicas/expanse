/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
    locales: ['en', 'es'],
    defaultLocale: 'en',
});

export type Locale = (typeof routing.locales)[number];