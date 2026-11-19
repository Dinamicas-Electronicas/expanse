/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { maxComposeBytes, maxComposesPerUser, maxScreenshotChars, maxServicesPerCompose } from '@/lib/limits';

afterEach(() => {
    delete process.env.MAX_COMPOSES_PER_USER;
    delete process.env.MAX_SERVICES_PER_COMPOSE;
    delete process.env.MAX_COMPOSE_BYTES;
    delete process.env.MAX_SCREENSHOT_CHARS;
});

describe('limits', () => {
    it('uses sane defaults', () => {
        expect(maxComposesPerUser()).toBe(50);
        expect(maxServicesPerCompose()).toBe(50);
        expect(maxComposeBytes()).toBe(1_000_000);
        expect(maxScreenshotChars()).toBe(4_000_000);
    });

    it('honours positive env overrides and ignores invalid values', () => {
        process.env.MAX_COMPOSES_PER_USER = '3';
        process.env.MAX_SERVICES_PER_COMPOSE = '-5';
        expect(maxComposesPerUser()).toBe(3);
        expect(maxServicesPerCompose()).toBe(50);
    });
});
