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
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { composeMetadata } from "@/lib/metadata";
import { processAndSaveClientExport } from "@/app/actions/exportActions";
import { revalidatePath } from "next/cache";
import { ensureAuth } from "@/lib/auth";
import { generateRandomString, isWithinOneDay } from "@/lib/utils";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import {
    emailSchema,
    loginCredentialsSchema,
    registrationSchema,
    zodErrorMessage,
} from "@/lib/validation";

export async function createOrLoginUser(email: string, data: any): Promise<string> {
    // Never trust the client: only password-based authentication is accepted
    // here. OAuth logins go through lib/oauth.ts, which is not a server action.
    const parsedEmail = emailSchema.parse(email);
    const password = typeof data?.password === 'string' ? data.password : '';

    if (!password) {
        throw new Error("Invalid email or password");
    }

    const db = await getDb();
    const collection = db.collection("users");
    const userExist = await collection.findOne({ email: parsedEmail });

    if (userExist) {
        if (!userExist.password) {
            throw new Error("Invalid email or password");
        }
        const passwordMatch = await bcrypt.compare(password, userExist.password);
        if (!passwordMatch) {
            throw new Error("Invalid email or password");
        }

        await setSessionCookie(await createSessionToken(userExist._id.toString(), userExist.email));
        return userExist._id.toString();
    }

    // New user: hash the password and never store client-provided auth flags
    const safeData: Record<string, any> = { ...(data ?? {}) };
    delete safeData.external;
    safeData.password = await bcrypt.hash(password, 10);

    // Check if this is the first user (becomes admin)
    const userCount = await collection.countDocuments();
    const isFirstUser = userCount === 0;

    const result = await collection.insertOne({
        email: parsedEmail,
        ...safeData,
        role: isFirstUser ? 'admin' : 'user',
        createdAt: new Date().getTime()
    });

    if (!result.insertedId) {
        throw new Error("Could not create the account");
    }

    await setSessionCookie(await createSessionToken(result.insertedId.toString(), parsedEmail));
    return result.insertedId.toString();
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
        const brevoId = await registerUserToBrevo({ email: input.email })
        await createOrLoginUser(input.email, {
            email: input.email,
            password: input.password,
            companyType: input.company,
            termsAccepted: true,
            brevoId,
        });

        const parsedData = JSON.parse(input.data)
        if (Object.keys(parsedData)?.length === 0) {
            return { ok: true, data: "" };
        }
        return { ok: true, data: Buffer.from(JSON.stringify(parsedData)).toString('base64url') };
    } catch (error) {
        return { ok: false, error: zodErrorMessage(error, 'Could not create the account') };
    }
}

export const registerCompose = async (compose: object, metadata: composeMetadata, id?: string | undefined, imageBase64?: string) => {
    const payload = await ensureAuth();
    const db = await getDb();
    const userId = new ObjectId(payload.userId as string);
    const collection = db.collection("composes");
    let result = "";
    if (id) {
        const objectId = new ObjectId(id);
        const updateResult = await collection.updateOne(
            { _id: objectId, userId: userId }, // scope to owner
            { $set: { data: compose, metadata: metadata, updatedAt: Date.now() } }
        );
        if (updateResult.matchedCount > 0) {
            result = objectId.toString();
        } else {
            throw new Error("Could not update document: not found or not owned by user.");
        }
    } else {
        const r = await collection.insertOne({
            userId: userId,
            data: compose,
            metadata: metadata,
            createdAt: Date.now(),
            updatedAt: Date.now()
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
        return result;
    }
    throw Error("could not register");
};

export const registerComposeWithoutMetadata = async (compose: object, userId: ObjectId) => {
    const db = await getDb();
    const collection = db.collection("composes");
    const r = await collection.insertOne({
        userId: userId,
        data: compose,
        metadata: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    const result = r.insertedId.toString();
    if (result) return result;
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
        email: z.string().email(),
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

        await setSessionCookie(await createSessionToken(user._id.toString(), user.email));

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

    return createSessionToken(user._id.toString(), user.email);
}

export const getComposeById = async (composeId: string) => {
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

export const deleteUser = async () => {
    const payload = await ensureAuth();
    const db = await getDb();
    const userId = new ObjectId(payload.userId as string);

    try {
        const userCollection = db.collection("users");
        const composeCollection = db.collection("composes");

        // Anonymize user's composes
        await composeCollection.updateMany({ userId: userId }, { $set: { userId: null } });

        const user = await userCollection.findOne({ _id: userId }, { projection: { email: 1 } });
        if (user?.email) {
            await updateUserList(user.email, [], [9]);
        }

        await userCollection.deleteOne({ _id: userId });
        (await cookies()).delete("token");
        console.log("account " + userId.toString() + " deleted");
    } catch (error) {
        console.error("Error deleting user:", error);
        throw new Error("Failed to delete account");
    }
    redirect("https://form.expanse.com/s/cm40i9zod000hwl0z6005uvwp");
}

export const logout = async () => {
    (await cookies()).delete("token");
    return { success: true };
};

export const deleteCompose = async (composeId: string) => {
    const payload = await ensureAuth();
    const db = await getDb();
    const composeCollection = db.collection("composes");

    await composeCollection.deleteOne({
        _id: new ObjectId(composeId),
        userId: new ObjectId(payload.userId as string)
    });

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
        email: z.string().email(),
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
        const user = await collection.findOne({ email: email });

        // Return success even if user not found to prevent email enumeration
        if (!user) {
            return { success: true };
        }

        const code = generateRandomString();
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
        const hashedPassword = await bcrypt.hash(password, 10);
        await user_collec.updateOne({ _id: resetCode.userId }, { $set: { password: hashedPassword } });

        return { success: true };

    } catch (e) {
        return { error: zodErrorMessage(e, 'An unknown error occurred') };
    }
}
