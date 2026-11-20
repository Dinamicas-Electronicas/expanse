/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { NextResponse } from "next/server";
import { Compose, Network, Service, Translator, Image, Binding, Volume } from "expanse-docker-lib";
import { verifySessionToken } from "@/lib/auth";
import { registerComposeWithoutMetadata } from "@/lib/composeStore";
import { ObjectId } from "bson";
import { parseImageRef } from "@/lib/imageRef";

function getFormattedDate() {
    const now = new Date();

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${day}/${month}_${hours}:${minutes}`;
}

export async function POST(req: Request) {
    const token = req.headers.get("Authorization")
    if(token){
        try{
            const payload = await verifySessionToken(token);
            const body = await req.json().catch(() => ({}));
            const containers = body?.containers && typeof body.containers === 'object' ? body.containers : {};
            const networks = body?.networks && typeof body.networks === 'object' ? body.networks : {};
            const volumes = body?.volumes && typeof body.volumes === 'object' ? body.volumes : {};
            const compose = new Compose()
            Object.keys(containers).forEach(key => {
                const imageRef = parseImageRef(String(containers[key]?.image ?? ''));
                compose.addService(new Service({
                    name: key,
                    image: new Image({
                        name: imageRef.name,
                        tag: imageRef.tag,
                    })
                }))
            })
            Object.keys(networks).forEach(networkName => {
                const concernedServicesNames = Object.keys(containers).filter(
                    containerKey => Array.isArray(containers[containerKey]?.networks)
                        && containers[containerKey].networks.includes(networkName)
                )
                const concernedServices = Array.from(compose.services).filter(c => concernedServicesNames.includes(c?.name))
                compose.addNetwork(new Network({name: networkName}), concernedServices)
            })
            Object.keys(volumes).forEach(volumeName => {
                const concernedServicesNames = Object.keys(containers).filter(
                    containerKey => Array.isArray(containers[containerKey]?.volumes)
                        && containers[containerKey].volumes.includes(volumeName)
                )
                const concernedServices = Array.from(compose.services).filter(c => concernedServicesNames.includes(c?.name))
                compose.addBinding(new Binding({
                    source: volumes[volumeName]?.type === "bind" ?
                        volumes[volumeName]?.source as string :
                        new Volume({name: volumeName}),
                    target: ""
                }), concernedServices)
            })
            compose.name = `cli-${getFormattedDate()}`
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
