'use server'

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { getDb } from "@/lib/mongodb"
import { z } from "zod";
import { zfd } from "zod-form-data";
import bcrypt from "bcryptjs";
import { registerUserToBrevo, sendRecoverPassdEmail, updateUserList } from "@/lib/brevo";
import { cookies } from 'next/headers'
import { ObjectId } from "bson";
import { composeMetadata } from "@/lib/metadata";
import { processAndSaveClientExport } from "@/app/actions/exportActions";
import { revalidatePath } from "next/cache";
import { ensureAuth } from "@/lib/auth";
import { isWithinOneDay } from "@/lib/utils";
import { randomBytes } from "crypto";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { createUserRecord } from "@/lib/users";
import { isValidObjectId } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/auditLog";
import {
    emailSchema,
    loginCredentialsSchema,
    registrationSchema,
    zodErrorMessage,
} from "@/lib/validation";

/**
 * Password login only.
 *
 * This used to create accounts as a side effect, which turned it into a public
 * signup endpoint that bypassed `DISABLE_SIGNUP`, terms acceptance and the
 * registration rate limit. New accounts are created only by `registerUser`
 * (password) or `loginOrRegisterOAuthUser` (verified OAuth identity).
 */
export async function createOrLoginUser(email: string, data: any): Promise<string> {
    const parsedEmail = emailSchema.parse(email);
    const password = typeof data?.password === 'string' ? data.password : '';

    if (!password) {
        throw new Error("Invalid email or password");
    }

    const limit = rateLimit(`${await clientKey('login')}:${parsedEmail}`, 10, 10 * 60 * 1000);
    if (!limit.ok) {
        throw new Error(`Too many login attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`);
    }

    const db = await getDb();
    const collection = db.collection("users");
    const userExist = await collection.findOne({ email: parsedEmail });

    if (!userExist?.password) {
        throw new Error("Invalid email or password");
    }

    const passwordMatch = await bcrypt.compare(password, userExist.password);
    if (!passwordMatch) {
        throw new Error("Invalid email or password");
    }

    await setSessionCookie(await createSessionToken(
        userExist._id.toString(),
        userExist.email,
        Number(userExist.sessionVersion ?? 0),
    ));
    await recordAuditEvent({ userId: userExist._id.toString(), action: 'auth.login' });
    return userExist._id.toString();
}


export type RegisterResult = { ok: true; data: string } | { ok: false; error: string };

export async function registerUser(email: string, password: string, company: string, terms: boolean, data: string): Promise<RegisterResult> {
    if (process.env.DISABLE_SIGNUP && process.env.DISABLE_SIGNUP.toLowerCase() !== "false") {
        console.error("Signup is disabled")
        return { ok: false, error: "Signup is disabled" };
    }

    const limit = rateLimit(await clientKey('register'), 5, 60 * 60 * 1000);
    if (!limit.ok) {
        return {
            ok: false,
            error: `Too many signup attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
        };
    }

    // Validate on the server: the browser form is not a trust boundary.
    // Errors are returned (not thrown) so the UI can show the actual message:
    // Next.js hides thrown Server Action messages in production.
    const validation = registrationSchema.safeParse({
        email,
        password,
        company: company || '',
        terms,
        data: data || '{}',
    });
    if (!validation.success) {
        return { ok: false, error: zodErrorMessage(validation.error, 'Invalid registration data') };
    }
    const input = validation.data;

    try {
        let parsedData: Record<string, unknown>;
        try {
            parsedData = JSON.parse(input.data);
        } catch {
            return { ok: false, error: 'Invalid project data' };
        }

        const passwordHash = await bcrypt.hash(input.password, 12);
        const { id } = await createUserRecord({
            email: input.email,
            passwordHash,
            fields: {
                companyType: input.company,
                termsAccepted: true,
            },
        });

        const brevoId = await registerUserToBrevo({ email: input.email });
        if (brevoId) {
            await (await getDb()).collection("users").updateOne({ _id: new ObjectId(id) }, { $set: { brevoId } });
        }

        await setSessionCookie(await createSessionToken(id, input.email, 0));
        await recordAuditEvent({ userId: id, action: 'auth.register' });

        if (Object.keys(parsedData)?.length === 0) {
            return { ok: true, data: "" };
        }
        return { ok: true, data: Buffer.from(JSON.stringify(parsedData)).toString('base64url') };
    } catch (error) {
        return { ok: false, error: zodErrorMessage(error, 'Could not create the account') };
    }
}

export const registerCompose = async (
    compose: object,
    metadata: composeMetadata,
    id?: string | undefined,
    imageBase64?: string,
    expectedUpdatedAt?: number,
) => {
    const payload = await ensureAuth();
    const db = await getDb();
    const userId = new ObjectId(payload.userId as string);
    const collection = db.collection("composes");
    const now = Date.now();
    let result = "";
    let updatedAt = now;

    if (id) {
        if (!isValidObjectId(id)) {
            throw new Error("Invalid compose id");
        }
        const objectId = new ObjectId(id);
        const filter: Record<string, unknown> = { _id: objectId, userId };
        // Optimistic concurrency: only overwrite the version the client read.
        if (typeof expectedUpdatedAt === 'number') {
            filter.updatedAt = expectedUpdatedAt;
        }

        const updateResult = await collection.updateOne(
            filter,
            { $set: { data: compose, metadata, updatedAt: now } }
        );

        if (updateResult.matchedCount === 0) {
            const exists = await collection.findOne({ _id: objectId, userId }, { projection: { _id: 1 } });
            if (exists) {
                throw new Error('SAVE_CONFLICT');
            }
            throw new Error("Could not update document: not found or not owned by user.");
        }
        result = objectId.toString();
    } else {
        const r = await collection.insertOne({
            userId,
            data: compose,
            metadata,
            createdAt: now,
            updatedAt: now,
        });
        result = r.insertedId.toString();
    }

    if (result) {
        if (imageBase64) {
            try {
                const { createHash } = await import("crypto");
                const { promises: fs } = await import("fs");
                const path = await import("path");
                const pngBuffer = await processAndSaveClientExport(result, imageBase64);
                const dataString = JSON.stringify(compose) + JSON.stringify(metadata);
                const checksum = createHash('sha256').update(dataString).digest('hex').substring(0, 16);
                const filename = `playground-${checksum}.png`;
                const filepath = path.join(process.cwd(), 'public', 'exports', filename);
                const exportsDir = path.dirname(filepath);
                await fs.mkdir(exportsDir, { recursive: true });
                await fs.writeFile(filepath, pngBuffer);
            } catch (error) {
                console.error("Failed to save client-side thumbnail:", error);
            }
        }
        return { id: result, updatedAt };
    }
    throw Error("could not register");
};

export const getAllMyComposeOrderByEditDate = async () => {
    if (process.env.npm_lifecycle_event === 'build') {
        return [];
    }
    const payload = await ensureAuth();
    const db = await getDb();
    const collection = db.collection("composes");
    const userId = new ObjectId(payload.userId as string);

    try {
        const composes = await collection
            .find({ userId: userId })
            .sort({ updatedAt: -1 })
            .toArray();

        return composes.map(compose => ({
            id: compose._id.toString(),
            data: compose.data,
            metadata: compose.metadata,
            createdAt: compose.createdAt,
            updatedAt: compose.updatedAt
        }));
    } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch composes");
    }
};

export async function loginUser(prevState: any, formData: FormData) {
    const loginSchema = zfd.formData({
        email: emailSchema,
        password: z.string().min(1).max(200),
        data: z.string().optional()
    });

    try {
        const { email, password, data } = loginSchema.parse({
            email: formData.get('email'),
            password: formData.get('password'),
            data: formData.get('data') || undefined
        });

        const limit = rateLimit(`${await clientKey('login')}:${String(email).toLowerCase()}`, 10, 10 * 60 * 1000);
        if (!limit.ok) {
            return { error: `Too many login attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` };
        }

        const db = await getDb();
        const collection = db.collection("users");
        const user = await collection.findOne({ email: email });

        if (!user || !user.password) throw new Error("Invalid email or password");

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) throw new Error("Invalid email or password");

        await setSessionCookie(await createSessionToken(
            user._id.toString(),
            user.email,
            Number(user.sessionVersion ?? 0),
        ));
        await recordAuditEvent({ userId: user._id.toString(), action: 'auth.login' });

        if (data) {
            const parsedData = JSON.parse(data);
            if (Object.keys(parsedData)?.length > 0) {
                const encoded = Buffer.from(JSON.stringify(parsedData)).toString('base64url');
                return { success: true, data: encoded };
            }
        }

        return { success: true };

    } catch (e) {
        return { error: zodErrorMessage(e, 'An unknown error occurred') };
    }
}

export async function getApiToken(email: string, password: string): Promise<string> {
    const credentials = loginCredentialsSchema.parse({ email, password });

    const limit = rateLimit(`${await clientKey('api-token')}:${credentials.email}`, 10, 10 * 60 * 1000);
    if (!limit.ok) {
        throw new Error(`Too many login attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`);
    }

    const db = await getDb();
    const collection = db.collection("users");
    const user = await collection.findOne({ email: credentials.email });

    if (!user || !user.password) throw new Error("Invalid email or password");

    const passwordMatch = await bcrypt.compare(credentials.password, user.password);
    if (!passwordMatch) throw new Error("Invalid email or password");

    return createSessionToken(user._id.toString(), user.email, Number(user.sessionVersion ?? 0));
}

export const getComposeById = async (composeId: string) => {
    if (!isValidObjectId(composeId)) return undefined;
    const payload = await ensureAuth();
    const db = await getDb();
    const collection = db.collection("composes");
    const userId = new ObjectId(payload.userId as string);

    try {
        const compose = await collection.findOne({
            _id: new ObjectId(composeId),
            userId: userId
        });

        if (!compose) return undefined;

        return {
            id: compose._id.toString(),
            data: compose.data,
            metadata: compose?.metadata,
            haConfig: compose?.haConfig,
            haEnabled: compose?.haEnabled === true,
            createdAt: compose.createdAt,
            updatedAt: compose.updatedAt
        };
    } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch compose");
    }
};

/**
 * Compose loader used by the render/export page.
 *
 * Despite its historical name this must NOT be public: it used to return any
 * compose (including environment secrets) to any caller, and server actions are
 * reachable without authentication. It now requires a session and ownership.
 */
export const getComposeByIdPublic = async (composeId: string) => {
    if (!isValidObjectId(composeId)) return undefined;
    const payload = await ensureAuth();
    const db = await getDb();
    const collection = db.collection("composes");
    const userId = new ObjectId(payload.userId as string);

    try {
        const compose = await collection.findOne({ _id: new ObjectId(composeId), userId });
        if (!compose) return undefined;

        return {
            id: compose._id.toString(),
            data: compose.data,
            metadata: compose?.metadata,
            haConfig: compose?.haConfig,
            haEnabled: compose?.haEnabled === true,
            createdAt: compose.createdAt,
            updatedAt: compose.updatedAt
        };
    } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch compose");
    }
};

export const getMyInfos = async () => {
    if (process.env.npm_lifecycle_event === 'build') {
        return undefined;
    }
    const payload = await ensureAuth();
    const db = await getDb();
    const collection = db.collection("users");
    const userId = new ObjectId(payload.userId as string);

    try {
        const user = await collection.findOne({ _id: userId }, { projection: { email: 1 } });
        if (!user) return undefined;
        return { email: user.email };
    } catch (error) {
        console.error(error);
        throw new Error("Failed to fetch user info");
    }
};

export const deleteUser = async (password?: string) => {
    const payload = await ensureAuth();
    const db = await getDb();
    const userId = new ObjectId(payload.userId as string);
    const userCollection = db.collection("users");

    try {
        const user = await userCollection.findOne({ _id: userId }, { projection: { email: 1, password: 1 } });
        if (!user) throw new Error("Account not found");

        // Re-authenticate on the server: the confirmation dialog is not a
        // security boundary. Passwordless (OAuth) accounts are exempt because
        // there is no password to verify.
        if (user.password) {
            if (!password || !(await bcrypt.compare(password, user.password))) {
                throw new Error("Invalid password");
            }
        }

        // Cascade: projects, shares and reset codes must not survive the account.
        await db.collection("composes").deleteMany({ userId });
        await db.collection("shares").deleteMany({ userId });
        await db.collection("reset_code").deleteMany({ userId });

        if (user.email) {
            await updateUserList(user.email, [], [9]);
        }

        await userCollection.deleteOne({ _id: userId });
        (await cookies()).delete("token");
        await recordAuditEvent({ userId, action: 'account.delete' });
    } catch (error) {
        console.error("Error deleting user:", error);
        throw new Error("Failed to delete account");
    }
    return { success: true };
}

export const logout = async () => {
    (await cookies()).delete("token");
    return { success: true };
};

/**
 * Invalidates every JWT issued so far (including this one) by bumping the
 * user's sessionVersion, then clears the current cookie.
 */
export const logoutEverywhere = async () => {
    const payload = await ensureAuth();
    if (payload.userId === 'build-mode') {
        return { success: true };
    }

    const userId = new ObjectId(payload.userId as string);
    await (await getDb()).collection("users").updateOne(
        { _id: userId },
        { $inc: { sessionVersion: 1 } },
    );
    (await cookies()).delete("token");
    await recordAuditEvent({ userId, action: 'auth.logout_all' });
    return { success: true };
};

export const deleteCompose = async (composeId: string) => {
    const payload = await ensureAuth();
    if (!isValidObjectId(composeId)) {
        throw new Error("Invalid compose id");
    }
    const db = await getDb();
    const userId = new ObjectId(payload.userId as string);
    const id = new ObjectId(composeId);

    // Remove the project and every share that points to it; otherwise the
    // public link survives and renders an empty canvas.
    const result = await db.collection("composes").deleteOne({ _id: id, userId });
    await db.collection("shares").deleteMany({ composeId: id, userId });

    if (result.deletedCount === 0) {
        throw new Error("Compose not found");
    }

    await recordAuditEvent({ userId, action: 'compose.delete', resource: composeId });
    revalidatePath("/dashboard", "page");
    return true;
}

/**
 * Verifies if the provided password matches the current user's password.
 * Used as a security gate for sensitive operations.
 */
export async function verifyUserPassword(password: string): Promise<boolean> {
    const payload = await ensureAuth();
    const db = await getDb();
    const collection = db.collection("users");
    const user = await collection.findOne({ _id: new ObjectId(payload.userId as string) });

    if (!user || !user.password) return false;

    return await bcrypt.compare(password, user.password);
}

export async function askPasswordReset(prevState: any, formData: FormData) {
    const passwordAskSchema = zfd.formData({
        email: emailSchema,
    });

    try {
        const { email } = passwordAskSchema.parse({ email: formData.get('email') });

        const limit = rateLimit(await clientKey('password-reset'), 5, 60 * 60 * 1000);
        if (!limit.ok) {
            // Same response as success: do not reveal whether the address exists.
            return { success: true };
        }

        const db = await getDb();
        const collection = db.collection("users");
        const user = await collection.findOne({ email });

        // Return success even if user not found to prevent email enumeration
        if (!user) {
            return { success: true };
        }

        const code = randomBytes(32).toString('base64url');
        const code_collec = db.collection("reset_code");
        const inserted = await code_collec.insertOne({
            code: code,
            type: email,
            createdAt: new Date().getTime(),
            userId: user._id
        });

        if (inserted) {
            await sendRecoverPassdEmail(email, code);
            return { success: true };
        }

        throw new Error("server side error");
    } catch (e) {
        if (e instanceof Error) return { error: e.message };
        return { error: "An unknown error occurred" };
    }
}

export async function passwordReset(prevState: any, formData: FormData) {
    const resetFormSchema = zfd.formData({
        password: z.string().min(8, "Password must be at least 8 characters"),
        password2: z.string(),
        code: z.string(),
    });

    try {
        const { password, password2, code } = resetFormSchema.parse({
            password: formData.get('password'),
            password2: formData.get('password2'),
            code: formData.get('code')
        });

        const limit = rateLimit(await clientKey('password-reset-submit'), 10, 60 * 60 * 1000);
        if (!limit.ok) {
            return { error: 'Too many attempts. Try again later.' };
        }

        if (password !== password2) throw new Error("Passwords are not the same");

        const db = await getDb();
        const code_collec = db.collection("reset_code");
        const resetCode = await code_collec.findOne({ code: code });

        if (!resetCode) throw new Error("The code is invalid");

        if (!isWithinOneDay(Number(resetCode?.createdAt), new Date().getTime())) {
            throw new Error("The code is outdated");
        }

        await code_collec.deleteOne({ code: code });
        const user_collec = db.collection("users");
        const hashedPassword = await bcrypt.hash(password, 12);
        await user_collec.updateOne(
            { _id: resetCode.userId },
            { $set: { password: hashedPassword }, $inc: { sessionVersion: 1 } }
        );
        await recordAuditEvent({ userId: resetCode.userId as ObjectId, action: 'auth.password_reset' });

        return { success: true };

    } catch (e) {
        return { error: zodErrorMessage(e, 'An unknown error occurred') };
    }
}
