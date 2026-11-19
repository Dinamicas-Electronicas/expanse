/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { describe, expect, it } from 'vitest';
import { ActionError, assertManagedProject } from '@/lib/authorization';

describe('assertManagedProject', () => {
    it('accepts projects owned by Expanse', () => {
        expect(assertManagedProject('expanse-project_6aff14b3f3ec933fa297d865'))
            .toBe('expanse-project_6aff14b3f3ec933fa297d865');
    });

    it('rejects host projects by default', () => {
        expect(() => assertManagedProject('portainer')).toThrow(ActionError);
    });

    it('allows host projects only with the explicit opt-in', () => {
        process.env.ALLOW_HOST_PROJECT_OPS = 'true';
        try {
            expect(assertManagedProject('portainer')).toBe('portainer');
        } finally {
            delete process.env.ALLOW_HOST_PROJECT_OPS;
        }
    });
});
