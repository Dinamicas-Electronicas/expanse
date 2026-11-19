/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import axios, { AxiosError } from "axios";

type RegisterType = {
    email: string | null,
}

export async function registerUserToBrevo(data: RegisterType): Promise<string | null> {
    if ((process.env.BREVO_DISABLED || "").toLowerCase() == "true") {
        return null
    }
    if (!data.email) {
        return null
    }
    try {
        const resp = await axios.post("https://api.brevo.com/v3/contacts",
            {
                email: data.email,
                listIds: [9]
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "api-key": process.env.BREVO_API_KEY
                }
            })
        return `${resp.data.id}`
    } catch (e) {
        const axiosError = e as AxiosError<any>;
        if (axiosError?.response?.data?.message === "Unable to create contact, email is already associated with another Contact") {
            console.log("retrieve contact ")
        }
        try {
            const resp = await axios.get(`https://api.brevo.com/v3/contacts/${data.email}`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        "api-key": process.env.BREVO_API_KEY
                    }
                })
            await updateUserList(data.email, [9])
            return `${resp.data.id}`
        } catch (e) {
            console.error(e)
        }
        console.error(e)
        return null
    }
}

export async function updateUserList(email: string, listsToAdd: number[] = [], listsToRemove: number[] = []) {
    if ((process.env.BREVO_DISABLED || "").toLowerCase() === "true") {
        return;
    }
    try {
        const resp = await axios.put(`https://api.brevo.com/v3/contacts/${email}`,
            {
                listIds: listsToAdd,
                unlinkListIds: listsToRemove
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "api-key": process.env.BREVO_API_KEY
                }
            })
        return `${resp.data}`
    } catch (e) {
        console.error(e)
    }
}

export async function sendRecoverPassdEmail(to: string, code: string) {
    const url = `${process.env.URL}/forgotPassword/reset?code=${code}`
    if ((process.env.BREVO_DISABLED || "").toLowerCase() == "true") {
        // Never log the reset URL: it contains a single-use password reset code.
        console.log('[Brevo] Disabled, password reset email not sent')
        return null
    }
    try {
        const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
            params: {
                url: url
            },
            templateId: 7,
            to: [
                {
                    email: to
                }
            ]
        }, {
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.BREVO_API_KEY
            }
        });

        console.log('Email sent successfully:', response.data);
    } catch (error) {
        console.error('Error sending email:', error?.toString());
    }

}

