/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { z, ZodError } from 'zod';

/** Returns the first human-readable validation message. */
export function zodErrorMessage(error: unknown, fallback = 'Invalid data'): string {
    if (error instanceof ZodError) {
        return error.issues[0]?.message || fallback;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

/** 24-char hex Mongo ObjectId. */
export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export function isValidObjectId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Password rules for *new* passwords. Existing accounts are unaffected
 * because login keeps accepting any stored password (min length 6).
 */
export const newPasswordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long');

export const registrationSchema = z.object({
    email: emailSchema,
    password: newPasswordSchema,
    company: z.string().max(120).optional().default(''),
    terms: z.literal(true, { message: 'You must accept the terms to create an account' }),
    data: z.string().max(2_000_000).optional().default('{}'),
});

export const loginCredentialsSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(200),
});
