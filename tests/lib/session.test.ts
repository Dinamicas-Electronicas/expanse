import { describe, expect, it } from 'vitest';
import { buildSessionCookie, SESSION_DURATION_MS } from '@/lib/session';

describe('buildSessionCookie', () => {
  const token = 'signed.jwt.token';

  it('is httpOnly, same-site and scoped to /', () => {
    const cookie = buildSessionCookie(token, 1_000);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.path).toBe('/');
    expect(cookie.name).toBe('token');
    expect(cookie.expires.getTime()).toBe(1_000 + SESSION_DURATION_MS);
  });

  it('sets Secure only when the public URL is HTTPS', () => {
    const previous = process.env.URL;

    process.env.URL = 'http://localhost:4000';
    expect(buildSessionCookie(token).secure).toBe(false);

    process.env.URL = 'https://expanse.example.com';
    expect(buildSessionCookie(token).secure).toBe(true);

    delete process.env.URL;
    expect(buildSessionCookie(token).secure).toBe(false);

    process.env.URL = previous;
  });
});
