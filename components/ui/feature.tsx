"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import {FeatureType, toggleFeatureLike} from "@/actions/featuresActions";
import {Card, CardContent, CardDescription, CardFooter, CardTitle} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import toast from "react-hot-toast";

type Options = FeatureType & {
    liked: boolean
};

export default function Feature(option:Options){

    async function handleLike(){
        try{
            await toggleFeatureLike(option.featureId.toString())
            toast.success(option.liked ? "Feature unliked":"Feature liked")
        }catch (e){
            console.error(e)
        }
    }

    return(
        <Card>
            <CardContent className='p-3'>
                <CardTitle className='font-semibold text-xl'>{option.title}</CardTitle>
                <CardDescription>{option.description}</CardDescription>
                <CardFooter className="p-0 pt-3">
                    <button onClick={handleLike} className={
                        cn("w-20 rounded py-1 bg-slate-100 hover:bg-slate-200 transition-all",{
                            "bg-slate-300": option.liked
                        })
                    }>
                        <p>{option.likeCount} 🐳</p>
                    </button>
                </CardFooter>
            </CardContent>
        </Card>
    )
}