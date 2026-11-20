/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import { Link } from '@/i18n/navigation'
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Never render raw error messages: they can contain database details.
        console.error('[Share] Rendering failed', error.digest ?? error.name)
    }, [error])

    return (
        <section className="flex h-full flex-grow justify-center items-center">
            <div className='flex flex-col w-full h-full justify-center '>
                <Skeleton className="shadow flex mx-10 h-4/5 rounded-xl justify-center items-center">
                    <div className='flex flex-col gap-3 items-center p-6 text-center'>
                        <p className="text-lg font-bold">This shared project could not be loaded</p>
                        <p className="text-sm text-slate-400">The link may be invalid or the project may have been removed.</p>
                        {error.digest && (
                            <code className="rounded bg-white/5 px-2 py-1 text-xs text-slate-500">ref: {error.digest}</code>
                        )}
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={reset}>Reload Page</Button>
                            <Button variant="outline" asChild>
                                <Link href="/">Go home</Link>
                            </Button>
                        </div>
                    </div>
                </Skeleton>
            </div>
        </section>
    )
}
