import { describe, expect, it } from 'vitest';
import {
  isValidObjectId,
  loginCredentialsSchema,
  newPasswordSchema,
  registrationSchema,
} from '@/lib/validation';

describe('isValidObjectId', () => {
  it('accepts 24-char hex ids', () => {
    expect(isValidObjectId('6aff14b3f3ec933fa297d865')).toBe(true);
    expect(isValidObjectId('6AFF14B3F3EC933FA297D865')).toBe(true);
  });

  it('rejects injection attempts and malformed ids', () => {
    for (const value of ['', 'abc', '6aff14b3f3ec933fa297d86', '$(reboot)', '../../etc/passwd', 42, null]) {
      expect(isValidObjectId(value)).toBe(false);
    }
  });
});

describe('newPasswordSchema', () => {
  it('requires at least 8 characters', () => {
    expect(newPasswordSchema.safeParse('short').success).toBe(false);
    expect(newPasswordSchema.safeParse('long-enough').success).toBe(true);
    expect(newPasswordSchema.safeParse('x'.repeat(101)).success).toBe(false);
  });
});

describe('registrationSchema', () => {
  const valid = {
    email: 'User@Example.com',
    password: 'strong-password',
    company: '',
    terms: true as const,
    data: '{}',
  };

  it('normalizes the email and accepts a valid signup', () => {
    const parsed = registrationSchema.parse(valid);
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects invalid emails, weak passwords and missing terms', () => {
    expect(registrationSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, password: '123' }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, terms: false }).success).toBe(false);
  });

  it('caps the embedded compose payload', () => {
    expect(registrationSchema.safeParse({ ...valid, data: 'x'.repeat(2_000_001) }).success).toBe(false);
  });
});

describe('loginCredentialsSchema', () => {
  it('accepts legacy short passwords but not empty ones', () => {
    expect(loginCredentialsSchema.safeParse({ email: 'a@b.com', password: '123456' }).success).toBe(true);
    expect(loginCredentialsSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});
