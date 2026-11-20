/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import {Button} from "@/components/ui/button";
import {AuthWithGithub} from "@/actions/github";
import toast from "react-hot-toast";
import Image from "next/image";

import ghLogo from "@/assets/expanse.png"

export default function GithubAuth({cli=false}:{cli?:boolean}){
    // OAuth is not available in CORE_ONLY deployment
    return null;

    async function handleConnect(){
        try{
            await AuthWithGithub(cli)
        }catch (e){
            toast.error("error: " + e?.toString())
        }
    }

    return <Button type="button" className="flex flex-row gap-2 w-full" onClick={()=>handleConnect()}>
        <Image height={22} src={ghLogo} alt={"github logo"} />
        <p>github</p>
    </Button>
}
