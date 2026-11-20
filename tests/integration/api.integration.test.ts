/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getComposeByShareId: vi.fn(),
  registerComposeWithoutMetadata: vi.fn(),
}));

vi.mock('@/actions/composeActions', () => ({ getComposeByShareId: mocks.getComposeByShareId }));
vi.mock('@/actions/userActions', () => ({ registerComposeWithoutMetadata: mocks.registerComposeWithoutMetadata }));

import { GET, POST } from '@/app/api/compose/route';
import { GET as ping } from '@/app/api/ping/route';

describe('API integration contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SECRET_KEY = 'integration-test-secret';
  });

  it('returns a stable liveness response', async () => {
    const response = await ping();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ msg: 'pong' });
  });

  it('rejects compose GET requests without an id', async () => {
    const response = await GET(new Request('http://localhost/api/compose'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'ID not found' });
    expect(mocks.getComposeByShareId).not.toHaveBeenCalled();
  });

  it('returns 404 when a share id has no compose data', async () => {
    mocks.getComposeByShareId.mockResolvedValue(undefined);

    const response = await GET(new Request('http://localhost/api/compose?id=507f1f77bcf86cd799439011'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Compose data not found' });
  });

  it('rejects compose POST requests without authorization', async () => {
    const response = await POST(new Request('http://localhost/api/compose', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'token is missing' });
    expect(mocks.registerComposeWithoutMetadata).not.toHaveBeenCalled();
  });

  it('rejects invalid bearer tokens without touching persistence', async () => {
    const response = await POST(new Request('http://localhost/api/compose', {
      method: 'POST',
      headers: { Authorization: 'invalid-token' },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'token is incorrect or outdated' });
    expect(mocks.registerComposeWithoutMetadata).not.toHaveBeenCalled();
  });
});
