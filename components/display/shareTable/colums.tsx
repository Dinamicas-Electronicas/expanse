"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { ColumnDef } from "@tanstack/react-table"
import {formatDistanceToNow} from "date-fns";
import {Button} from "@/components/ui/button";
import {ArrowUpDown, ExternalLink} from "lucide-react";
import { Link } from "@/i18n/navigation";
import toast from "react-hot-toast";
import {deleteShareById} from "@/actions/composeActions";

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type ShareLine = {
    id: string
    composeName: string,
    createdAt: number,
    link: string
}

async function handleDelete(id:string){
    try{
        await deleteShareById(id)
        toast.success("Share deleted")
    }catch(e){
        console.error(e)
        toast.error("Can't delete this share.")
    }
}



export const columns: ColumnDef<ShareLine>[] = [
    {
        accessorKey: "composeName",
        header: "Name",
        cell: ({row})=>{
            return(
                <p>{row.getValue("composeName") || "unamed"}</p>
            )
        }
    },
    {
        accessorKey: "createdAt",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Created at
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({row})=>{
            return(
                formatDistanceToNow(row.getValue("createdAt"), { addSuffix: true })
            )
        }
    },
    {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
            return (
                <div className='flex flex-row gap-2 w-fit'>
                    <Link href={`/share?id=${row.original.id}&name=${row.getValue("composeName")}`}><Button variant="secondary"><ExternalLink height={20} /></Button></Link>
                    <Button
                        onClick={()=>{
                            navigator.clipboard.writeText(row.original?.link);
                            toast.success("Copied to clipBoard")
                        }}
                    >Copy link</Button>
                    <Button onClick={()=>{handleDelete(row.original.id)}} variant="destructive">Delete</Button>
                </div>
            )
        },
    },
]
