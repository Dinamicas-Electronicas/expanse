/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { rateLimit, resetRateLimits } from '@/lib/rateLimit';

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows requests up to the limit and blocks the next one', () => {
    const now = 1_000;
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit('login:1.2.3.4', 3, 60_000, now).ok).toBe(true);
    }
    const blocked = rateLimit('login:1.2.3.4', 3, 60_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('keeps independent buckets', () => {
    const now = 1_000;
    expect(rateLimit('a', 1, 60_000, now).ok).toBe(true);
    expect(rateLimit('a', 1, 60_000, now).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000, now).ok).toBe(true);
  });

  it('resets after the window elapses', () => {
    const now = 1_000;
    expect(rateLimit('reset', 1, 60_000, now).ok).toBe(true);
    expect(rateLimit('reset', 1, 60_000, now + 60_001).ok).toBe(true);
  });

  it('reports the remaining attempts', () => {
    const now = 1_000;
    expect(rateLimit('remaining', 5, 60_000, now).remaining).toBe(4);
    expect(rateLimit('remaining', 5, 60_000, now).remaining).toBe(3);
  });
});
