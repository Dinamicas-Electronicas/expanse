"use client"

/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Copy, MoreHorizontal, Share, Trash2, Square, Boxes } from "lucide-react";
import { ComposeLine } from "@/components/display/composeTable/colums";
import { deleteCompose } from "@/actions/userActions";
import { stopProjectByName, removeProjectByName } from "@/actions/dockerActions";
import toast from "react-hot-toast";
import { useState } from "react";
import { shareCompose } from "@/actions/composeActions";

async function handleDelete(composeId: string) {
    if (!window.confirm("Delete this project? The deployment (if running) will keep running and its files cannot be recovered.")) {
        return;
    }
    try {
        await deleteCompose(composeId)
        toast.success("Deleted")
    } catch (e) {
        console.error(e)
        toast.error("Error")
    }
}

export default function ComposeRow(data: ComposeLine) {

    const [shareOpen, setShareOpen] = useState(false)
    const [link, setLink] = useState("")
    const [sharePassword, setSharePassword] = useState("")

    async function handleShare(composeId: string, password?: string) {
        try {
            setShareOpen(true)
            const res = await shareCompose(composeId, password)
            setLink(`${res}&name=${data.name}`)
        } catch (e) {
            console.error(e)
            toast.error("Error")
        }
    }

    async function handleStopDeploy() {
        if (!data.projectName) return
        toast.promise(stopProjectByName(data.projectName), {
            loading: 'Stopping deployment...',
            success: 'Deployment stopped',
            error: 'Failed to stop deployment'
        })
    }

    async function handleRemoveDeploy() {
        if (!data.projectName) return
        if (!window.confirm("Remove this deployment? Containers and ALL persistent volumes will be deleted.")) {
            return
        }
        toast.promise(removeProjectByName(data.projectName), {
            loading: 'Removing deployment...',
            success: 'Deployment removed',
            error: 'Failed to remove deployment'
        })
    }

    return (
        <div className='flex flex-row items-center gap-3'>
            <Link href={`/dashboard/playground?id=${data.id}`}>
                <Button>
                    View
                </Button>
            </Link>
            <DropdownMenu onOpenChange={open => { if (!open) setShareOpen(false) }}>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <Popover open={shareOpen} >
                        <PopoverTrigger asChild>
                            <DropdownMenuItem onClick={(e) => {
                                e.preventDefault(); // Prevent default click behavior
                                e.stopPropagation(); // Prevent event propagation to close the menu
                                handleShare(data.id)
                            }}>
                                <Share /> Share
                            </DropdownMenuItem>
                        </PopoverTrigger>
                        <PopoverContent sideOffset={-30} className="flex flex-col gap-2">
                            <span className="flex flex col justify-between rounded border-2 p-1">
                                <input className="outline-0" value={link} />
                                <button onClick={() => { navigator.clipboard.writeText(link); toast("Link copied") }} type="button" className='rounded bg-black text-white text-xs flex flex-row justify-center items-center gap-2 py-1 px-2 active:bg-slate-500 transition-all'>
                                    <Copy height={20} className='stroke-white' />
                                    <p>Copy</p>
                                </button>
                            </span>
                            <p className="text-sm text-slate-600">You can share this link to anyone, they won't require any account to view this compose.</p>
                            <p className="text-xs text-amber-600 font-semibold">
                                Warning: the public YAML includes environment variables and may contain database passwords.
                            </p>
                            <p className="text-xs text-slate-500">
                                Links expire automatically (30 days by default; configure SHARE_TTL_DAYS).
                            </p>
                            <div className="flex gap-2">
                                <Input
                                    type="password"
                                    value={sharePassword}
                                    onChange={(event) => setSharePassword(event.target.value)}
                                    placeholder="Optional password"
                                    className="h-8 text-xs"
                                />
                                <Button
                                    type="button"
                                    className="h-8 text-xs"
                                    onClick={() => handleShare(data.id, sharePassword)}
                                    disabled={!sharePassword}
                                >
                                    Protect
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                    {data.status && (
                        <>
                            <DropdownMenuItem onClick={handleStopDeploy}>
                                <Square className="fill-amber-400 text-amber-400" /> Stop Deployment
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleRemoveDeploy} className="text-rose-400 focus:text-rose-400">
                                <Boxes /> Remove Deployment
                            </DropdownMenuItem>
                        </>
                    )}
                    <DropdownMenuItem onClick={() => { handleDelete(data.id.toString()) }} className="text-red-500 focus:text-red-500">
                        <Trash2 /> Delete File
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}