/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { describe, expect, it } from 'vitest';
import { parseImageRef } from '@/lib/imageRef';

describe('parseImageRef', () => {
    it('parses a simple image with tag', () => {
        expect(parseImageRef('postgres:16-alpine')).toEqual({
            name: 'postgres',
            tag: '16-alpine',
            digest: undefined,
        });
    });

    it('defaults to latest when the tag is missing', () => {
        expect(parseImageRef('redis').tag).toBe('latest');
    });

    it('keeps registry ports in the name', () => {
        expect(parseImageRef('registry:5000/team/app:2.1')).toMatchObject({
            name: 'registry:5000/team/app',
            tag: '2.1',
        });
    });

    it('parses digests without treating the digest colon as a tag', () => {
        expect(parseImageRef('ghcr.io/team/app@sha256:abc123')).toMatchObject({
            name: 'ghcr.io/team/app',
            tag: 'latest',
            digest: 'sha256:abc123',
        });
    });
});
