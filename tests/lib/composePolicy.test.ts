/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { describe, expect, it } from 'vitest';
import { validateComposePolicy } from '@/lib/composePolicy';

const base = {
    services: {
        web: { image: 'nginx:1.27', ports: ['8080:80'] },
    },
};

describe('compose security policy', () => {
    it('accepts a normal application stack', () => {
        expect(validateComposePolicy(base)).toEqual({ ok: true });
    });

    it('accepts named volumes and relative bind mounts', () => {
        expect(validateComposePolicy({
            services: {
                db: {
                    image: 'postgres:16',
                    volumes: ['db_data:/var/lib/postgresql/data', './data:/data'],
                },
            },
        })).toEqual({ ok: true });
    });

    it.each([
        ['privileged', { privileged: true }],
        ['cap_add', { cap_add: ['SYS_ADMIN'] }],
        ['devices', { devices: ['/dev/sda:/dev/sda'] }],
        ['network_mode host', { network_mode: 'host' }],
        ['pid host', { pid: 'host' }],
    ])('rejects %s', (_label, extra) => {
        const result = validateComposePolicy({
            services: { app: { image: 'alpine', ...extra } },
        });
        expect(result.ok).toBe(false);
    });

    it.each([
        '/etc/passwd:/etc/passwd',
        '/:/host',
        '/var/run/docker.sock:/var/run/docker.sock',
        '../secrets:/secrets',
    ])('rejects the sensitive mount %s', (mount) => {
        const result = validateComposePolicy({
            services: { app: { image: 'alpine', volumes: [mount] } },
        });
        expect(result.ok).toBe(false);
    });

    it('allows host mounts only with the explicit opt-in', () => {
        const compose = {
            services: { app: { image: 'alpine', volumes: ['/etc/localtime:/etc/localtime:ro'] } },
        };
        expect(validateComposePolicy(compose).ok).toBe(false);
        expect(validateComposePolicy(compose, { allowHostMounts: true })).toEqual({ ok: true });
    });

    it('never allows the Docker socket by default', () => {
        const compose = {
            services: { app: { image: 'alpine', volumes: ['/var/run/docker.sock:/var/run/docker.sock'] } },
        };
        expect(validateComposePolicy(compose, { allowHostMounts: true }).ok).toBe(false);
    });

    it('allows the Docker socket only with the explicit admin opt-in', () => {
        const compose = {
            services: { app: { image: 'alpine', volumes: ['/var/run/docker.sock:/var/run/docker.sock'] } },
        };
        expect(validateComposePolicy(compose, { allowHostMounts: true, allowDockerSocket: true })).toEqual({ ok: true });
        expect(validateComposePolicy(compose, { allowHostMounts: true }).ok).toBe(false);
    });

    it('rejects build contexts unless explicitly enabled', () => {
        const compose = { services: { app: { build: './app' } } };
        expect(validateComposePolicy(compose).ok).toBe(false);
        expect(validateComposePolicy(compose, { allowBuild: true }).ok).toBe(false); // image still required
        expect(validateComposePolicy({ services: { app: { image: 'alpine', build: './app' } } }, { allowBuild: true }))
            .toEqual({ ok: true });
    });

    it('rejects host file secrets/configs', () => {
        expect(validateComposePolicy({
            ...base,
            secrets: { token: { file: '/etc/token' } },
        }).ok).toBe(false);
    });
});
