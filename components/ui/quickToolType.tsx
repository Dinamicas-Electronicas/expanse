/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import {ReactElement} from "react";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {CircleHelp} from "lucide-react";

export default function QuickToolType({message,className,color="grey",width=20,height=20}:{message:string,className?:string,color?:string,width?:number,height?:number}):ReactElement<any>{
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <CircleHelp width={width} height={height} className={className} color={color} />
                </TooltipTrigger>
                <TooltipContent>
                    <p>{message}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}