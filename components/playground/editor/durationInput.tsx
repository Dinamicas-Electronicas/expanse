/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import {Input} from "@/components/ui/input";
import {TimeUnits,Delay} from "expanse-docker-lib";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {useEffect, useState} from "react";

type DurationArgs = {
    onValueChange ?: (delay:Delay)=>void
}

export default function DurationInput(options:DurationArgs){

    const [time, setTime] = useState(30)
    const [unit, setUnit] = useState<TimeUnits>(TimeUnits.SECONDS)

    useEffect(() => {
        if(options.onValueChange){
            options.onValueChange(new Delay(time,unit))
        }
    }, [time,unit,options]);

    return(
        <div className="flex flex-row w-full gap-1">
            <Input value={time} onChange={(e)=>setTime(Number(e.target.value))} className="w-3/5" />
            <Select
                    value={unit}
                    onValueChange={(value:TimeUnits) => {
                        setUnit(value)
                    }}
            >
                <SelectTrigger className="w-2/5">
                    <SelectValue placeholder="seconds"/>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={TimeUnits.NANOSECONDS}>nano seconds</SelectItem>
                    <SelectItem value={TimeUnits.MILLISECONDS}>milli seconds</SelectItem>
                    <SelectItem value={TimeUnits.MICROSECONDS}>micro seconds</SelectItem>
                    <SelectItem value={TimeUnits.SECONDS}>seconds</SelectItem>
                    <SelectItem value={TimeUnits.MINUTES}>minutes</SelectItem>
                    <SelectItem value={TimeUnits.HOURS}>hours</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}