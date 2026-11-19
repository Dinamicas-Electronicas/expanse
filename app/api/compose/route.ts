/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { NextResponse } from "next/server";
import { getComposeByShareId } from "@/actions/composeActions";
import { Translator } from "expanse-docker-lib";
import YAML from "yaml";
import { verifySessionToken } from "@/lib/auth";
import { registerComposeWithoutMetadata } from "@/lib/composeStore";
import { ObjectId } from "bson";

export async function GET(req: Request) {
    const id = new URL(req.url).searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "ID not found" }, { status: 400 });
    }

    if (!/^[a-f0-9]{24}$/i.test(id)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    try {
        const compose = await getComposeByShareId(id);

        if (!compose?.data?.length) {
            return NextResponse.json({ error: "Compose data not found" }, { status: 404 });
        }

        const c = Translator.fromDict(compose.data[0].data)
        const t = new Translator(c)
        const headers = new Headers();
        headers.set("Content-Type", "application/x-yaml");
        headers.set("Content-Disposition", "attachment; filename=\"docker-compose.yaml\"");

        return new NextResponse(YAML.stringify(t.toDict()), { status: 200, headers });
    } catch (error) {
        console.error("Compose export error:", error);
        return NextResponse.json({ error: "Failed to export compose" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const token = req.headers.get("Authorization")
    if(token){
        try{
            const payload = await verifySessionToken(token);
            const body = await req.json();
            const compose = Translator.fromDict(body)
            const t = new Translator(compose)
            const composeId = await registerComposeWithoutMetadata(t.toDict(),new ObjectId(payload.userId as string))
            return NextResponse.json({id: composeId}, {status: 200})
        }catch (e:any){
            console.error(e)
            return NextResponse.json({error: "token is incorrect or outdated"}, {status: 403})
        }
    }
    return NextResponse.json({error: "token is missing"}, {status: 403})
}
